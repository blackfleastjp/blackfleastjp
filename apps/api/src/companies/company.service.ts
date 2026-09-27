import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../db/prisma';
import { recordActivity } from '../audit/record-activity';
import type { createCompanySchema, updateCompanySchema } from './company.schema';
import { HttpError } from '../utils/http-error';
import type { z } from 'zod';

type CreateCompanyInput = z.infer<typeof createCompanySchema>;
type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
type CompanySnapshot = {
  version: 1;
  company: {
    id: string;
    name: string;
    code: string;
    address: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    country: string;
    gstin: string | null;
    pan: string | null;
    email: string | null;
    phone: string | null;
    logo: string | null;
    financialYearStart: string | null;
    financialYearEnd: string | null;
    booksBeginningDate: string | null;
    baseCurrency: string;
    enableAccounting: boolean;
    enableInventory: boolean;
    enableGst: boolean;
    enablePayroll: boolean;
    isActive: boolean;
  };
  roles: Array<{
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    permissions: Array<{ module: string; action: string; name: string }>;
  }>;
  userAssignments: Array<{ userId: string; roleIds: string[] }>;
};

function activeCompanyId(request: Request): string {
  if (!request.auth) throw new HttpError(401, 'Authentication is required.');
  return request.auth.companyId;
}

function requirePathContext(request: Request): string {
  const companyId = activeCompanyId(request);
  if (request.params.id !== companyId) {
    throw new HttpError(404, 'The company was not found in the active company context.');
  }
  return companyId;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function checksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function dateToString(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

async function buildSnapshot(
  database: Prisma.TransactionClient | typeof prisma,
  companyId: string,
): Promise<CompanySnapshot> {
  const company = await database.company.findUnique({
    where: { id: companyId },
    include: {
      roles: { include: { permissions: { select: { module: true, action: true, name: true } } } },
      userCompanyRoles: { select: { userId: true, roleId: true } },
    },
  });
  if (!company) throw new HttpError(404, 'The company was not found.');

  const assignments = new Map<string, string[]>();
  for (const assignment of company.userCompanyRoles) {
    const roleIds = assignments.get(assignment.userId) ?? [];
    roleIds.push(assignment.roleId);
    assignments.set(assignment.userId, roleIds);
  }

  return {
    version: 1,
    company: {
      id: company.id,
      name: company.name,
      code: company.code,
      address: company.address,
      city: company.city,
      state: company.state,
      pincode: company.pincode,
      country: company.country,
      gstin: company.gstin,
      pan: company.pan,
      email: company.email,
      phone: company.phone,
      logo: company.logo,
      financialYearStart: dateToString(company.financialYearStart),
      financialYearEnd: dateToString(company.financialYearEnd),
      booksBeginningDate: dateToString(company.booksBeginningDate),
      baseCurrency: company.baseCurrency,
      enableAccounting: company.enableAccounting,
      enableInventory: company.enableInventory,
      enableGst: company.enableGst,
      enablePayroll: company.enablePayroll,
      isActive: company.isActive,
    },
    roles: company.roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions,
    })),
    userAssignments: [...assignments].map(([userId, roleIds]) => ({ userId, roleIds })),
  };
}

export async function listCompanies(request: Request) {
  if (!request.auth) throw new HttpError(401, 'Authentication is required.');
  const memberships = await prisma.userCompanyRole.findMany({
    where: { userId: request.auth.userId },
    select: {
      userId: true,
      company: {
        include: {
          _count: { select: { roles: true, backups: true } },
        },
      },
      role: { select: { name: true } },
    },
    orderBy: { company: { name: 'asc' } },
  });
  const companies = new Map<
    string,
    {
      company: (typeof memberships)[number]['company'];
      roles: Set<string>;
    }
  >();
  for (const membership of memberships) {
    const entry = companies.get(membership.company.id) ?? {
      company: membership.company,
      roles: new Set<string>(),
    };
    entry.roles.add(membership.role.name);
    companies.set(membership.company.id, entry);
  }
  const accessibleCompanyIds = [...companies.keys()];
  const allMemberships = accessibleCompanyIds.length
    ? await prisma.userCompanyRole.findMany({
        where: { companyId: { in: accessibleCompanyIds } },
        distinct: ['companyId', 'userId'],
        select: { companyId: true, userId: true },
      })
    : [];
  const userCounts = new Map<string, number>();
  for (const membership of allMemberships) {
    userCounts.set(membership.companyId, (userCounts.get(membership.companyId) ?? 0) + 1);
  }
  return [...companies.values()].map(({ company, roles }) => ({
    ...company,
    roles: [...roles],
    _count: { ...company._count, users: userCounts.get(company.id) ?? 0 },
  }));
}

export async function getCompany(request: Request) {
  const companyId = requirePathContext(request);
  const company = await prisma.company.findFirst({
    where: { id: companyId, userCompanyRoles: { some: { userId: request.auth!.userId } } },
    include: {
      _count: { select: { roles: true, backups: true } },
      backups: {
        select: { id: true, name: true, checksum: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!company) throw new HttpError(404, 'The company was not found.');
  const users = await prisma.userCompanyRole.findMany({
    where: { companyId },
    distinct: ['userId'],
    select: { userId: true },
  });
  return { ...company, _count: { ...company._count, users: users.length } };
}

export async function createCompany(request: Request, input: CreateCompanyInput) {
  const auth = request.auth;
  if (!auth) throw new HttpError(401, 'Authentication is required.');
  const result = await prisma.$transaction(async (transaction) => {
    const sourcePermissions = await transaction.permission.findMany({
      where: { roleId: { in: auth.roleIds } },
      select: { module: true, action: true, name: true },
    });
    const uniquePermissions = [
      ...new Map(
        sourcePermissions.map((permission) => [
          `${permission.module}:${permission.action}`,
          permission,
        ]),
      ).values(),
    ];
    const companyData: Prisma.CompanyCreateInput = input;
    const company = await transaction.company.create({ data: companyData });
    const administrator = await transaction.role.create({
      data: {
        companyId: company.id,
        name: 'Administrator',
        description: 'Company administrator created with the company.',
        isSystem: true,
        permissions: { create: uniquePermissions },
      },
    });
    await transaction.userCompanyRole.create({
      data: { userId: auth.userId, companyId: company.id, roleId: administrator.id },
    });
    await recordActivity(transaction, request, {
      companyId: company.id,
      entity: 'company',
      entityId: company.id,
      action: 'create',
      details: { code: company.code },
    });
    return company;
  });
  return result;
}

export async function updateCompany(request: Request, input: UpdateCompanyInput) {
  const companyId = requirePathContext(request);
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.company.findUnique({ where: { id: companyId } });
    if (!existing) throw new HttpError(404, 'The company was not found.');
    const financialYearStart =
      input.financialYearStart === undefined
        ? existing.financialYearStart
        : input.financialYearStart;
    const financialYearEnd =
      input.financialYearEnd === undefined ? existing.financialYearEnd : input.financialYearEnd;
    if (financialYearStart && financialYearEnd && financialYearEnd <= financialYearStart) {
      throw new HttpError(400, 'Financial year end must be after its start.');
    }
    const company = await transaction.company.update({ where: { id: companyId }, data: input });
    await recordActivity(transaction, request, {
      entity: 'company',
      entityId: company.id,
      action: 'update',
      details: { fields: Object.keys(input) },
    });
    return company;
  });
}

export async function deactivateCompany(request: Request) {
  const companyId = requirePathContext(request);
  return prisma.$transaction(async (transaction) => {
    const company = await transaction.company.update({
      where: { id: companyId },
      data: { isActive: false },
    });
    await recordActivity(transaction, request, {
      entity: 'company',
      entityId: company.id,
      action: 'delete',
    });
    return company;
  });
}

export async function setCompanyActive(request: Request, isActive: boolean) {
  const companyId = requirePathContext(request);
  return prisma.$transaction(async (transaction) => {
    const company = await transaction.company.update({
      where: { id: companyId },
      data: { isActive },
    });
    await recordActivity(transaction, request, {
      entity: 'company',
      entityId: company.id,
      action: isActive ? 'activate' : 'deactivate',
    });
    return company;
  });
}

export async function createCompanyBackup(request: Request, name?: string) {
  const companyId = requirePathContext(request);
  if (!request.auth) throw new HttpError(401, 'Authentication is required.');
  return prisma.$transaction(
    async (transaction) => {
      const snapshot = await buildSnapshot(transaction, companyId);
      const snapshotChecksum = checksum(snapshot);
      const backup = await transaction.companyBackup.create({
        data: {
          companyId,
          createdById: request.auth!.userId,
          name: name ?? `Company snapshot ${new Date().toISOString()}`,
          checksum: snapshotChecksum,
          payload: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
        },
        select: { id: true, companyId: true, name: true, checksum: true, createdAt: true },
      });
      await recordActivity(transaction, request, {
        entity: 'company',
        entityId: companyId,
        action: 'backup',
        details: { backupId: backup.id },
      });
      return backup;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export async function restoreCompanyBackup(request: Request, backupId: string) {
  const companyId = requirePathContext(request);
  if (!request.auth) throw new HttpError(401, 'Authentication is required.');
  const backup = await prisma.companyBackup.findFirst({ where: { id: backupId, companyId } });
  if (!backup) throw new HttpError(404, 'The company backup was not found.');
  if (checksum(backup.payload) !== backup.checksum) {
    throw new HttpError(409, 'The company backup checksum is invalid.');
  }
  const snapshot = backup.payload as unknown as CompanySnapshot;
  if (snapshot.version !== 1 || snapshot.company.id !== companyId) {
    throw new HttpError(400, 'The company backup format is unsupported.');
  }

  return prisma.$transaction(async (transaction) => {
    const company = await transaction.company.update({
      where: { id: companyId },
      data: {
        ...snapshot.company,
        financialYearStart: snapshot.company.financialYearStart
          ? new Date(snapshot.company.financialYearStart)
          : null,
        financialYearEnd: snapshot.company.financialYearEnd
          ? new Date(snapshot.company.financialYearEnd)
          : null,
        booksBeginningDate: snapshot.company.booksBeginningDate
          ? new Date(snapshot.company.booksBeginningDate)
          : null,
      },
    });

    await transaction.userCompanyRole.deleteMany({ where: { companyId } });
    const savedRoleIds = snapshot.roles.map(({ id }) => id);
    await transaction.role.deleteMany({ where: { companyId, id: { notIn: savedRoleIds } } });

    for (const role of snapshot.roles) {
      await transaction.role.upsert({
        where: { id: role.id },
        update: { name: role.name, description: role.description, isSystem: role.isSystem },
        create: {
          id: role.id,
          companyId,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
        },
      });
      await transaction.permission.deleteMany({ where: { roleId: role.id } });
      if (role.permissions.length) {
        await transaction.permission.createMany({
          data: role.permissions.map((permission) => ({ ...permission, roleId: role.id })),
        });
      }
    }

    for (const assignment of snapshot.userAssignments) {
      const user = await transaction.user.findUnique({
        where: { id: assignment.userId },
        select: { id: true },
      });
      if (!user) continue;
      for (const roleId of assignment.roleIds.filter((id) => savedRoleIds.includes(id))) {
        await transaction.userCompanyRole.create({ data: { userId: user.id, companyId, roleId } });
      }
    }

    await recordActivity(transaction, request, {
      entity: 'company',
      entityId: companyId,
      action: 'restore',
      details: { backupId },
    });
    return company;
  });
}
