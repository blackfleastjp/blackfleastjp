import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { HttpError } from '../utils/http-error';
import { createAccessToken, createRefreshToken, hashToken, verifyRefreshToken } from '../utils/jwt';

const profileInclude = {
  company: true,
  userCompanyRoles: {
    include: { company: true, role: { include: { permissions: true } } },
  },
} satisfies Prisma.UserInclude;

type UserWithProfile = Prisma.UserGetPayload<{ include: typeof profileInclude }>;

export type AuthenticatedUser = {
  id: string;
  companyId: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  companies: Array<{ id: string; name: string; code: string; roles: string[] }>;
  roleName: string;
  roleIds: string[];
  permissions: string[];
};

export type AuthResult = { accessToken: string; refreshToken: string; user: AuthenticatedUser };

function toAuthenticatedUser(user: UserWithProfile, companyId = user.companyId): AuthenticatedUser {
  const memberships = user.userCompanyRoles.filter((item) => item.companyId === companyId);
  if (memberships.length === 0) {
    throw new HttpError(403, 'You do not have access to the selected company.');
  }

  const roles = [...new Map(memberships.map(({ role }) => [role.id, role])).values()];
  const companiesById = new Map<
    string,
    { id: string; name: string; code: string; roles: string[] }
  >();
  for (const item of user.userCompanyRoles) {
    const company = companiesById.get(item.companyId) ?? {
      id: item.company.id,
      name: item.company.name,
      code: item.company.code,
      roles: [],
    };
    if (!company.roles.includes(item.role.name)) company.roles.push(item.role.name);
    companiesById.set(item.companyId, company);
  }

  return {
    id: user.id,
    companyId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    companyName: memberships[0]!.company.name,
    companies: [...companiesById.values()],
    roleName: roles.map(({ name }) => name).join(', '),
    roleIds: roles.map(({ id }) => id),
    permissions: [
      ...new Set(
        roles.flatMap((role) =>
          role.permissions.map(({ module, action }) => `${module}:${action}`),
        ),
      ),
    ],
  };
}

async function persistRefreshToken(
  userId: string,
  transaction: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string> {
  const issued = createRefreshToken(userId);
  await transaction.refreshToken.create({
    data: {
      jti: issued.jti,
      tokenHash: hashToken(issued.token),
      userId,
      expiresAt: issued.expiresAt,
    },
  });
  return issued.token;
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: profileInclude,
  });
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'Email or password is incorrect.');
  }

  const authenticatedUser = toAuthenticatedUser(user);
  const refreshToken = await persistRefreshToken(user.id);
  return { accessToken: createAccessToken(user.id), refreshToken, user: authenticatedUser };
}

export async function refresh(token: string, companyId?: string): Promise<AuthResult> {
  const claims = verifyRefreshToken(token);
  if (!claims) throw new HttpError(401, 'The refresh token is invalid or expired.');

  // Revoke the single-use token and persist its replacement atomically to prevent replay races.
  const { user, refreshToken, selectedCompanyId } = await prisma.$transaction(
    async (transaction) => {
      const storedToken = await transaction.refreshToken.findUnique({
        where: { jti: claims.jti },
        include: { user: { include: profileInclude } },
      });
      if (
        !storedToken ||
        storedToken.userId !== claims.sub ||
        storedToken.revokedAt ||
        storedToken.expiresAt <= new Date() ||
        storedToken.tokenHash !== hashToken(token) ||
        !storedToken.user.isActive
      ) {
        throw new HttpError(401, 'The refresh token is invalid or expired.');
      }

      const selectedCompanyId = companyId ?? storedToken.user.companyId;
      toAuthenticatedUser(storedToken.user, selectedCompanyId);
      const revoked = await transaction.refreshToken.updateMany({
        where: { id: storedToken.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) throw new HttpError(401, 'The refresh token has already been used.');
      const replacementToken = await persistRefreshToken(storedToken.userId, transaction);
      return { user: storedToken.user, refreshToken: replacementToken, selectedCompanyId };
    },
  );

  return {
    accessToken: createAccessToken(user.id),
    refreshToken,
    user: toAuthenticatedUser(user, selectedCompanyId),
  };
}

export async function logout(token?: string): Promise<void> {
  if (!token) return;
  const claims = verifyRefreshToken(token);
  if (!claims) return;
  await prisma.refreshToken.updateMany({
    where: { jti: claims.jti, tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getAuthenticatedUser(
  userId: string,
  companyId?: string,
): Promise<AuthenticatedUser> {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    include: profileInclude,
  });
  if (!user) throw new HttpError(401, 'The user account is unavailable.');
  return toAuthenticatedUser(user, companyId ?? user.companyId);
}
