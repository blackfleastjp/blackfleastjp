import { createHash } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createSuccess, parseDurationSeconds, permissionDefinitions } from "@erp/shared";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registrationSchema,
  resetPasswordSchema,
} from "@erp/validation";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { AppError, unauthorized } from "../lib/errors.js";
import { authenticate, authenticateOptional } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";
import { issuePasswordResetToken, passwordResetTokenHash } from "../lib/password-reset.js";

export const authRouter = Router();
const refreshCookieName = "erp_refresh";

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/api/auth",
    maxAge: parseDurationSeconds(env.JWT_REFRESH_EXPIRES_IN) * 1000,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  } as const;
}

function clearRefreshCookie(response: import("express").Response): void {
  const { maxAge: _maxAge, ...options } = cookieOptions();
  response.clearCookie(refreshCookieName, options);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createAccessToken(user: { id: string; email: string }): string {
  return jwt.sign({ email: user.email, type: "access" }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: parseDurationSeconds(env.JWT_ACCESS_EXPIRES_IN),
  });
}

function createRefreshToken(userId: string): string {
  return jwt.sign({ type: "refresh" }, env.JWT_REFRESH_SECRET, {
    subject: userId,
    expiresIn: parseDurationSeconds(env.JWT_REFRESH_EXPIRES_IN),
  });
}

async function getAuthUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId, isActive: true },
    select: {
      id: true,
      email: true,
      name: true,
      companyRoles: {
        where: {
          isActive: true,
          role: { isActive: true },
          company: { isActive: true, deletedAt: null },
        },
        select: {
          company: {
            select: { id: true, name: true, code: true, currency: true, baseCurrency: true },
          },
          role: {
            select: {
              name: true,
              permissions: { select: { permission: { select: { key: true } } } },
            },
          },
        },
      },
    },
  });
  if (!user) throw unauthorized("The session account is no longer active");
  const companyMap = new Map<
    string,
    {
      id: string;
      name: string;
      code: string;
      currency: string;
      baseCurrency: string;
      roles: string[];
      permissions: Set<string>;
    }
  >();
  for (const membership of user.companyRoles) {
    const company = companyMap.get(membership.company.id) ?? {
      ...membership.company,
      roles: [],
      permissions: new Set<string>(),
    };
    company.roles.push(membership.role.name);
    membership.role.permissions.forEach((item) => company.permissions.add(item.permission.key));
    companyMap.set(company.id, company);
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    companies: [...companyMap.values()].map((company) => ({
      ...company,
      permissions: [...company.permissions],
    })),
  };
}

async function createSession(
  request: import("express").Request,
  response: import("express").Response,
  user: { id: string; email: string },
) {
  const refreshToken = createRefreshToken(user.id);
  const expiresAt = new Date(Date.now() + parseDurationSeconds(env.JWT_REFRESH_EXPIRES_IN) * 1000);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
      userAgent: request.get("user-agent")?.slice(0, 500) ?? null,
      ipAddress: request.ip ?? null,
    },
  });
  response.cookie(refreshCookieName, refreshToken, cookieOptions());
  return { accessToken: createAccessToken(user), user: await getAuthUser(user.id) };
}

authRouter.post("/register", async (request, response) => {
  const input = registrationSchema.parse(request.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    const user = await prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: { email: input.email, name: input.name, passwordHash },
        select: { id: true, email: true },
      });
      const company = await transaction.company.create({
        data: { name: input.companyName, code: input.companyCode },
      });
      const permissionRows = permissionDefinitions.map((permission) => ({
        permission: {
          connectOrCreate: {
            where: { key: permission.key },
            create: { ...permission, description: permission.name },
          },
        },
      }));
      const role = await transaction.role.create({
        data: {
          companyId: company.id,
          name: "Administrator",
          description: "Full access to this company",
          isSystem: true,
          permissions: { create: permissionRows },
        },
      });
      await transaction.userCompanyRole.create({
        data: { userId: createdUser.id, companyId: company.id, roleId: role.id },
      });
      await transaction.user.update({
        where: { id: createdUser.id },
        data: { companyId: company.id },
      });
      await transaction.auditLog.create({
        data: {
          userId: createdUser.id,
          companyId: company.id,
          action: "auth.register",
          module: "auth",
          requestId: request.requestId,
          ipAddress: request.ip ?? null,
          userAgent: request.get("user-agent")?.slice(0, 500) ?? null,
          entityType: "company",
          entityId: company.id,
          newValue: { name: company.name, code: company.code },
        },
      });
      return createdUser;
    });
    const session = await createSession(request, response, user);
    response.status(201).json(createSuccess(session, "Account created", request.requestId));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const metadata =
        "meta" in error && typeof error.meta === "object" && error.meta !== null
          ? (error.meta as { target?: unknown })
          : undefined;
      const target = metadata?.target;
      if (Array.isArray(target) && target.includes("code")) {
        throw new AppError(409, "COMPANY_CODE_IN_USE", "A company with this code already exists");
      }
      throw new AppError(409, "EMAIL_IN_USE", "An account with this email already exists");
    }
    throw error;
  }
});

authRouter.post("/login", async (request, response) => {
  const input = loginSchema.parse(request.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const passwordMatches = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  const authenticated = Boolean(user?.isActive && !user.deletedAt && passwordMatches);
  await prisma.loginEvent.create({
    data: {
      userId: user?.isActive && !user.deletedAt && passwordMatches ? user.id : null,
      email: input.email,
      succeeded: authenticated,
      ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent")?.slice(0, 500) ?? null,
    },
  });
  if (!user || !user.isActive || user.deletedAt || !passwordMatches) {
    await writeAudit(request, "auth.login.failed", {
      userId: user?.id ?? null,
      companyId: user?.companyId ?? null,
      module: "auth",
      entityType: "user",
      ...(user ? { entityId: user.id } : {}),
    });
    throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeAudit(request, "auth.login", {
    userId: user.id,
    companyId: user.companyId,
    module: "auth",
    entityType: "user",
    entityId: user.id,
  });
  const session = await createSession(request, response, user);
  response.json(createSuccess(session, "Signed in", request.requestId));
});

authRouter.post("/refresh", async (request, response) => {
  const token = request.cookies[refreshCookieName] as string | undefined;
  if (!token) throw unauthorized("Refresh session is missing");
  let claims: jwt.JwtPayload;
  try {
    claims = jwt.verify(token, env.JWT_REFRESH_SECRET) as jwt.JwtPayload;
  } catch {
    clearRefreshCookie(response);
    throw unauthorized("Refresh session is invalid or expired");
  }
  if (claims["type"] !== "refresh" || typeof claims.sub !== "string")
    throw unauthorized("Refresh session is invalid");

  const current = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!current || current.userId !== claims.sub || current.expiresAt <= new Date()) {
    clearRefreshCookie(response);
    throw unauthorized("Refresh session has expired or was revoked");
  }
  if (current.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: current.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    clearRefreshCookie(response);
    throw unauthorized("Refresh token reuse detected; all sessions were revoked");
  }

  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser(current.userId);
  } catch (error) {
    clearRefreshCookie(response);
    throw error;
  }

  const nextToken = createRefreshToken(current.userId);
  const nextExpiresAt = new Date(
    Date.now() + parseDurationSeconds(env.JWT_REFRESH_EXPIRES_IN) * 1000,
  );
  await prisma.$transaction(async (transaction) => {
    const revoked = await transaction.refreshToken.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) throw unauthorized("Refresh session was already used");
    const replacement = await transaction.refreshToken.create({
      data: {
        userId: current.userId,
        tokenHash: hashToken(nextToken),
        expiresAt: nextExpiresAt,
        userAgent: request.get("user-agent")?.slice(0, 500) ?? null,
        ipAddress: request.ip ?? null,
      },
    });
    await transaction.refreshToken.update({
      where: { id: current.id },
      data: { replacedBy: replacement.id },
    });
  });
  response.cookie(refreshCookieName, nextToken, cookieOptions());
  response.json(
    createSuccess(
      { accessToken: createAccessToken(user), user },
      "Session refreshed",
      request.requestId,
    ),
  );
});

authRouter.post("/logout", authenticateOptional, async (request, response) => {
  const token = request.cookies[refreshCookieName] as string | undefined;
  const session = token
    ? await prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(token) },
        select: { userId: true },
      })
    : null;
  if (token) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  const userId = request.auth?.userId ?? session?.userId;
  if (userId) await writeAudit(request, "auth.logout", { userId });
  clearRefreshCookie(response);
  response.json(createSuccess({ signedOut: true }, "Signed out", request.requestId));
});

authRouter.get("/me", authenticate, async (request, response) => {
  const user = await getAuthUser(request.auth!.userId);
  response.json(createSuccess(user, "Current user", request.requestId));
});

authRouter.post("/change-password", authenticate, async (request, response) => {
  const input = changePasswordSchema.parse(request.body);
  const user = await prisma.user.findUnique({ where: { id: request.auth!.userId } });
  if (
    !user ||
    !user.isActive ||
    user.deletedAt ||
    !(await bcrypt.compare(input.currentPassword, user.passwordHash))
  ) {
    throw new AppError(400, "CURRENT_PASSWORD_INVALID", "Current password is incorrect");
  }
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({ where: { id: user.id }, data: { passwordHash } });
    await transaction.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAudit(
      request,
      "auth.password-changed",
      {
        userId: user.id,
        companyId: user.companyId,
        module: "auth",
        entityType: "user",
        entityId: user.id,
        newValue: { passwordChanged: true },
      },
      transaction,
    );
  });
  clearRefreshCookie(response);
  response.json(createSuccess({ passwordChanged: true }, "Password changed", request.requestId));
});

authRouter.post("/forgot-password", async (request, response) => {
  const input = forgotPasswordSchema.parse(request.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const data: { resetToken?: string } = {};
  if (user?.isActive && !user.deletedAt) {
    const token = await issuePasswordResetToken(request, {
      id: user.id,
      email: user.email,
      companyId: user.companyId,
    });
    if (env.NODE_ENV !== "production" && !env.EMAIL_PROVIDER) data.resetToken = token;
  }
  response.json(
    createSuccess(
      data,
      "If the account exists, password reset instructions have been sent",
      request.requestId,
    ),
  );
});

authRouter.post("/reset-password", async (request, response) => {
  const input = resetPasswordSchema.parse(request.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  await prisma.$transaction(async (transaction) => {
    const reset = await transaction.passwordResetToken.findUnique({
      where: { tokenHash: passwordResetTokenHash(input.token) },
      include: { user: true },
    });
    const now = new Date();
    if (
      !reset ||
      reset.usedAt ||
      reset.expiresAt <= now ||
      !reset.user.isActive ||
      reset.user.deletedAt
    ) {
      throw unauthorized("Password reset token is invalid or expired");
    }
    const claimed = await transaction.passwordResetToken.updateMany({
      where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw unauthorized("Password reset token has already been used");
    await transaction.user.update({ where: { id: reset.userId }, data: { passwordHash } });
    await transaction.passwordResetToken.updateMany({
      where: { userId: reset.userId, usedAt: null },
      data: { usedAt: now },
    });
    await transaction.refreshToken.updateMany({
      where: { userId: reset.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await writeAudit(
      request,
      "auth.password-reset",
      {
        userId: reset.userId,
        companyId: reset.user.companyId,
        module: "auth",
        entityType: "user",
        entityId: reset.userId,
        newValue: { passwordReset: true },
      },
      transaction,
    );
  });
  clearRefreshCookie(response);
  response.json(createSuccess({ passwordReset: true }, "Password reset", request.requestId));
});
