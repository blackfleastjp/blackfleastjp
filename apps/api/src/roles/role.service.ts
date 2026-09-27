import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import type { z } from 'zod';
import { recordActivity } from '../audit/record-activity';
import { prisma } from '../db/prisma';
import { HttpError } from '../utils/http-error';
import type { createRoleSchema, rolePermissionSchema, updateRoleSchema } from './role.schema';

type CreateRoleInput = z.infer<typeof createRoleSchema>;
type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
type PermissionInput = z.infer<typeof rolePermissionSchema>;

function companyContext(request: Request): {
  companyId: string;
  userId: string;
  permissions: Set<string>;
} {
  if (!request.auth) throw new HttpError(401, 'Authentication is required.');
  return {
    companyId: request.auth.companyId,
    userId: request.auth.userId,
    permissions: new Set(request.auth.permissions),
  };
}

function ensureCanGrant(
  request: Request,
  permissions: PermissionInput[],
  existingPermissions: PermissionInput[] = [],
): void {
  const granted = new Set(request.auth?.permissions ?? []);
  const existing = new Set(existingPermissions.map(({ module, action }) => `${module}:${action}`));
  const forbidden = permissions.find(({ module, action }) => {
    const permissionKey = `${module}:${action}`;
    return !existing.has(permissionKey) && !granted.has(permissionKey);
  });
  if (forbidden) {
    throw new HttpError(
      403,
      `You cannot grant the permission ${forbidden.module}:${forbidden.action}.`,
    );
  }
}

async function replacePermissions(
  transaction: Prisma.TransactionClient,
  roleId: string,
  permissions: PermissionInput[],
): Promise<void> {
  await transaction.permission.deleteMany({ where: { roleId } });
  if (permissions.length) {
    const permissionData: Prisma.PermissionCreateManyInput[] = permissions.map((permission) => ({
      ...permission,
      roleId,
    }));
    await transaction.permission.createMany({
      data: permissionData,
    });
  }
}

export async function listRoles(request: Request) {
  const { companyId } = companyContext(request);
  return prisma.role.findMany({
    where: { companyId },
    include: {
      permissions: { orderBy: [{ module: 'asc' }, { action: 'asc' }] },
      _count: { select: { userCompanyRoles: true } },
    },
    orderBy: { name: 'asc' },
  });
}

export async function createRole(request: Request, input: CreateRoleInput) {
  const { companyId } = companyContext(request);
  ensureCanGrant(request, input.permissions);
  return prisma.$transaction(async (transaction) => {
    const roleData: Prisma.RoleCreateInput = {
      name: input.name,
      description: input.description,
      company: { connect: { id: companyId } },
      permissions: { create: input.permissions },
    };
    const role = await transaction.role.create({
      data: roleData,
      include: { permissions: true },
    });
    await recordActivity(transaction, request, {
      entity: 'role',
      entityId: role.id,
      action: 'create',
      details: { name: role.name, permissions: input.permissions.length },
    });
    return role;
  });
}

async function findCompanyRole(request: Request, roleId: string) {
  const { companyId } = companyContext(request);
  const role = await prisma.role.findFirst({
    where: { id: roleId, companyId },
    include: { permissions: { select: { module: true, action: true, name: true } } },
  });
  if (!role) throw new HttpError(404, 'The role was not found in the active company.');
  return role;
}

export async function updateRole(request: Request, roleId: string, input: UpdateRoleInput) {
  const existing = await findCompanyRole(request, roleId);
  if (input.permissions) ensureCanGrant(request, input.permissions, existing.permissions);
  return prisma.$transaction(async (transaction) => {
    const role = await transaction.role.update({
      where: { id: existing.id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description }),
      },
    });
    if (input.permissions) await replacePermissions(transaction, role.id, input.permissions);
    await recordActivity(transaction, request, {
      entity: 'role',
      entityId: role.id,
      action: 'update',
      details: { name: input.name, permissionsChanged: input.permissions !== undefined },
    });
    return transaction.role.findUniqueOrThrow({
      where: { id: role.id },
      include: { permissions: { orderBy: [{ module: 'asc' }, { action: 'asc' }] } },
    });
  });
}

export async function deleteRole(request: Request, roleId: string) {
  const { companyId } = companyContext(request);
  const role = await findCompanyRole(request, roleId);
  if (role.isSystem) throw new HttpError(409, 'System roles cannot be deleted.');
  const assignments = await prisma.userCompanyRole.count({ where: { companyId, roleId } });
  if (assignments > 0) throw new HttpError(409, 'Remove this role from users before deleting it.');
  return prisma.$transaction(async (transaction) => {
    await transaction.role.delete({ where: { id: roleId } });
    await recordActivity(transaction, request, {
      entity: 'role',
      entityId: roleId,
      action: 'delete',
    });
    return { id: roleId, deleted: true };
  });
}

export async function assignRolePermissions(
  request: Request,
  roleId: string,
  permissions: PermissionInput[],
) {
  const { companyId } = companyContext(request);
  const role = await findCompanyRole(request, roleId);
  ensureCanGrant(request, permissions, role.permissions);
  return prisma.$transaction(async (transaction) => {
    await replacePermissions(transaction, role.id, permissions);
    await recordActivity(transaction, request, {
      entity: 'role',
      entityId: role.id,
      action: 'assign-permissions',
      details: { permissions: permissions.length },
    });
    return transaction.role.findFirstOrThrow({
      where: { id: role.id, companyId },
      include: { permissions: { orderBy: [{ module: 'asc' }, { action: 'asc' }] } },
    });
  });
}
