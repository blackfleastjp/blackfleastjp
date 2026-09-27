import { createHash } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createSuccess, parseDurationSeconds } from "@erp/shared";
import { loginSchema, registrationSchema } from "@erp/validation";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { AppError, unauthorized } from "../lib/errors.js";
import { authenticate, authenticateOptional } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";

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
        where: { company: { isActive: true } },
        select: {
          company: { select: { id: true, name: true, currency: true } },
          role: { select: { name: true } },
        },
      },
    },
  });
  if (!user) throw unauthorized("The session account is no longer active");
  const companyMap = new Map<
    string,
    { id: string; name: string; currency: string; roles: string[] }
  >();
  for (const membership of user.companyRoles) {
    const company = companyMap.get(membership.company.id) ?? { ...membership.company, roles: [] };
    company.roles.push(membership.role.name);
    companyMap.set(company.id, company);
  }
  return { id: user.id, email: user.email, name: user.name, companies: [...companyMap.values()] };
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
      const company = await transaction.company.create({ data: { name: input.companyName } });
      const role = await transaction.role.create({
        data: {
          companyId: company.id,
          name: "Administrator",
          description: "Full access to this company",
          isSystem: true,
          permissions: {
            create: [
              "company.read",
              "company.manage",
              "users.read",
              "users.manage",
              "audit.read",
            ].map((key) => ({
              permission: { connectOrCreate: { where: { key }, create: { key } } },
            })),
          },
        },
      });
      await transaction.userCompanyRole.create({
        data: { userId: createdUser.id, companyId: company.id, roleId: role.id },
      });
      await transaction.auditLog.create({
        data: {
          userId: createdUser.id,
          companyId: company.id,
          action: "auth.register",
          requestId: request.requestId,
          ipAddress: request.ip ?? null,
        },
      });
      return createdUser;
    });
    const session = await createSession(request, response, user);
    response.status(201).json(createSuccess(session, "Account created", request.requestId));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new AppError(409, "EMAIL_IN_USE", "An account with this email already exists");
    }
    throw error;
  }
});

authRouter.post("/login", async (request, response) => {
  const input = loginSchema.parse(request.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const passwordMatches = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  const authenticated = Boolean(user?.isActive && passwordMatches);
  await prisma.loginEvent.create({
    data: {
      userId: user?.isActive && passwordMatches ? user.id : null,
      email: input.email,
      succeeded: authenticated,
      ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent")?.slice(0, 500) ?? null,
    },
  });
  if (!user || !user.isActive || !passwordMatches)
    throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  await writeAudit(request, "auth.login", { userId: user.id });
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
