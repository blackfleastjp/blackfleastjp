import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import type { z } from 'zod';
import { recordActivity } from '../audit/record-activity';
import { prisma } from '../db/prisma';
import { HttpError } from '../utils/http-error';
import type { createUserSchema, updateUserSchema, userListQuerySchema } from './user.schema';

type CreateUserInput = z.infer<typeof createUserSchema>;
type UpdateUserInput = z.infer<typeof updateUserSchema>;
type UserListQuery = z.infer<typeof userListQuerySchema>;

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  employeeCode: true,
  department: true,
  designation: true,
  mobile: true,
  alternateEmail: true,
  dateOfJoining: true,
  isActive: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
  userCompanyRoles: {
    select: { role: { select: { id: true, name: true, description: true } } },
  },
} satisfies Prisma.UserSelect;

function getCompanyId(request: Request): string {
  if (!request.auth) throw new HttpError(401, 'Authentication is required.');
  return request.auth.companyId;
}

async function validateRoles(
  database: Prisma.TransactionClient | typeof prisma,
  companyId: string,
  roleIds: string[],
  allowedPermissions: Set<string>,
): Promise<void> {
  const roles = await database.role.findMany({
    where: { id: { in: roleIds }, companyId },
    include: { permissions: { select: { module: true, action: true } } },
  });
  if (roles.length !== new Set(roleIds).size) {
    throw new HttpError(400, 'Every assigned role must belong to the active company.');
  }
  const forbiddenGrant = roles
    .flatMap(({ permissions }) => permissions)
    .find(({ module, action }) => !allowedPermissions.has(`${module}:${action}`));
  if (forbiddenGrant) {
    throw new HttpError(
      403,
      `You cannot assign a role granting ${forbiddenGrant.module}:${forbiddenGrant.action}.`,
    );
  }
}

async function findCompanyUser(request: Request, userId: string) {
  const companyId = getCompanyId(request);
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      userCompanyRoles: { some: { companyId } },
    },
    select: {
      id: true,
      isActive: true,
      userCompanyRoles: { where: { companyId }, select: { roleId: true } },
    },
  });
  if (!user) throw new HttpError(404, 'The user was not found in the active company.');
  return user;
}

export async function listUsers(request: Request, query: UserListQuery) {
  const companyId = getCompanyId(request);
  const where: Prisma.UserWhereInput = {
    userCompanyRoles: {
      some: {
        companyId,
        ...(query.roleId ? { roleId: query.roleId } : {}),
      },
    },
    ...(query.status === 'all' ? {} : { isActive: query.status === 'active' }),
    ...(query.department ? { department: { equals: query.department, mode: 'insensitive' } } : {}),
    ...(query.q
      ? {
          OR: [
            { firstName: { contains: query.q, mode: 'insensitive' } },
            { lastName: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
            { employeeCode: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: {
        ...userSelect,
        userCompanyRoles: {
          where: { companyId },
          select: { role: { select: { id: true, name: true, description: true } } },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return {
    users: users.map((user) => ({
      ...user,
      roles: user.userCompanyRoles.map(({ role }) => role),
      userCompanyRoles: undefined,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    pageCount: Math.ceil(total / query.pageSize),
  };
}

export async function getUser(request: Request, userId: string) {
  const companyId = getCompanyId(request);
  const user = await prisma.user.findFirst({
    where: { id: userId, userCompanyRoles: { some: { companyId } } },
    select: {
      ...userSelect,
      userCompanyRoles: {
        where: { companyId },
        select: { role: { select: { id: true, name: true, description: true, isSystem: true } } },
      },
    },
  });
  if (!user) throw new HttpError(404, 'The user was not found in the active company.');
  return {
    ...user,
    roles: user.userCompanyRoles.map(({ role }) => role),
    userCompanyRoles: undefined,
  };
}

export async function createUser(request: Request, input: CreateUserInput) {
  const companyId = getCompanyId(request);
  if (!request.auth) throw new HttpError(401, 'Authentication is required.');
  const allowedPermissions = new Set(request.auth.permissions);
  const { roleIds, password, ...profile } = input;
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.$transaction(async (transaction) => {
    await validateRoles(transaction, companyId, roleIds, allowedPermissions);
    const userData: Prisma.UserCreateInput = {
      ...profile,
      passwordHash,
      company: { connect: { id: companyId } },
      userCompanyRoles: {
        create: roleIds.map((roleId) => ({
          company: { connect: { id: companyId } },
          role: { connect: { id_companyId: { id: roleId, companyId } } },
        })),
      },
    };
    const user = await transaction.user.create({
      data: userData,
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    await recordActivity(transaction, request, {
      entity: 'user',
      entityId: user.id,
      action: 'create',
      details: { email: user.email, roleIds },
    });
    return getUserInTransaction(transaction, user.id, companyId);
  });
}

async function getUserInTransaction(
  transaction: Prisma.TransactionClient,
  userId: string,
  companyId: string,
) {
  const user = await transaction.user.findFirst({
    where: { id: userId, userCompanyRoles: { some: { companyId } } },
    select: {
      ...userSelect,
      userCompanyRoles: {
        where: { companyId },
        select: { role: { select: { id: true, name: true, description: true } } },
      },
    },
  });
  if (!user) throw new HttpError(404, 'The user was not found in the active company.');
  return {
    ...user,
    roles: user.userCompanyRoles.map(({ role }) => role),
    userCompanyRoles: undefined,
  };
}

export async function updateUser(request: Request, userId: string, input: UpdateUserInput) {
  const companyId = getCompanyId(request);
  await findCompanyUser(request, userId);
  if (userId === request.auth?.userId && input.isActive === false) {
    throw new HttpError(400, 'You cannot deactivate your own account.');
  }
  const { roleIds, password, isActive, ...profile } = input;
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;
  return prisma.$transaction(async (transaction) => {
    if (roleIds)
      await validateRoles(transaction, companyId, roleIds, new Set(request.auth!.permissions));
    await transaction.user.update({
      where: { id: userId },
      data: {
        ...profile,
        ...(passwordHash ? { passwordHash } : {}),
        ...(isActive === undefined ? {} : { isActive }),
      },
    });
    if (roleIds) {
      await transaction.userCompanyRole.deleteMany({ where: { userId, companyId } });
      await transaction.userCompanyRole.createMany({
        data: roleIds.map((roleId) => ({ userId, companyId, roleId })),
      });
    }
    if (isActive === false) {
      await transaction.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await recordActivity(transaction, request, {
      entity: 'user',
      entityId: userId,
      action: 'update',
      details: { fields: Object.keys(input).filter((field) => field !== 'password'), roleIds },
    });
    return getUserInTransaction(transaction, userId, companyId);
  });
}

export async function deactivateUser(request: Request, userId: string) {
  await findCompanyUser(request, userId);
  if (userId === request.auth?.userId)
    throw new HttpError(400, 'You cannot deactivate your own account.');
  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: { id: true, email: true },
    });
    await transaction.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordActivity(transaction, request, {
      entity: 'user',
      entityId: user.id,
      action: 'delete',
      details: { email: user.email },
    });
    return { id: user.id, isActive: false };
  });
}

export async function resetUserPassword(request: Request, userId: string, password: string) {
  await findCompanyUser(request, userId);
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({ where: { id: userId }, data: { passwordHash } });
    await transaction.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordActivity(transaction, request, {
      entity: 'user',
      entityId: userId,
      action: 'reset-password',
    });
  });
}

export async function getUserActivity(
  request: Request,
  userId: string,
  page: number,
  pageSize: number,
) {
  const companyId = getCompanyId(request);
  await findCompanyUser(request, userId);
  const where = { companyId, entity: 'user', entityId: userId };
  const [items, total] = await prisma.$transaction([
    prisma.activityLog.findMany({
      where,
      include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activityLog.count({ where }),
  ]);
  return { items, page, pageSize, total, pageCount: Math.ceil(total / pageSize) };
}
