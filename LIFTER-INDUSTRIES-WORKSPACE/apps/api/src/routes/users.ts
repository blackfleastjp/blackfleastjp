import { randomBytes } from "node:crypto";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createSuccess } from "@erp/shared";
import {
  assignUserRolesSchema,
  createUserSchema,
  idParamsSchema,
  paginationSchema,
  updateUserSchema,
  userListSchema,
} from "@erp/validation";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { issuePasswordResetToken } from "../lib/password-reset.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";
import { requireCompanyContext } from "../middleware/company-context.js";

export const usersRouter = Router();
const scoped = [authenticate, requireCompanyContext] as const;

function userAuditView(user: {
  id: string;
  email: string;
  name: string;
  employeeCode: string | null;
  department: string | null;
  designation: string | null;
  mobile: string | null;
  alternateEmail: string | null;
  dateOfJoining: Date | null;
  isActive: boolean;
  deletedAt: Date | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    employeeCode: user.employeeCode,
    department: user.department,
    designation: user.designation,
    mobile: user.mobile,
    alternateEmail: user.alternateEmail,
    dateOfJoining: user.dateOfJoining?.toISOString().slice(0, 10) ?? null,
    isActive: user.isActive,
    deletedAt: user.deletedAt?.toISOString() ?? null,
  };
}

function ensureId(request: Parameters<typeof idParamsSchema.parse>[0]): string {
  return idParamsSchema.parse(request).id;
}

usersRouter.get("/", ...scoped, requirePermission("users.read"), async (request, response) => {
  const query = userListSchema.parse(request.query);
  const companyId = request.auth!.companyId!;
  const where: Prisma.UserWhereInput = {
    companyId,
    deletedAt: null,
    ...(query.status === "active" ? { isActive: true } : {}),
    ...(query.status === "inactive" ? { isActive: false } : {}),
    ...(query.department
      ? { department: { contains: query.department, mode: "insensitive" } }
      : {}),
    ...(query.roleId
      ? { companyRoles: { some: { companyId, roleId: query.roleId, isActive: true } } }
      : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
            { employeeCode: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        employeeCode: true,
        department: true,
        designation: true,
        mobile: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        companyRoles: {
          where: { companyId, isActive: true, role: { isActive: true } },
          select: { role: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);
  response.json(
    createSuccess(
      {
        items: items.map((user) => ({
          ...user,
          roles: user.companyRoles.map((membership) => membership.role),
        })),
        page: query.page,
        pageSize: query.pageSize,
        total,
        pageCount: Math.ceil(total / query.pageSize),
      },
      "Users",
      request.requestId,
    ),
  );
});

usersRouter.post("/", ...scoped, requirePermission("users.create"), async (request, response) => {
  const input = createUserSchema.parse(request.body);
  const companyId = request.auth!.companyId!;
  const role = await prisma.role.findFirst({
    where: { id: input.roleId, companyId, isActive: true },
    select: { id: true, name: true },
  });
  if (!role) throw new AppError(400, "ROLE_INVALID", "Select an active role in this company");
  if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw new AppError(409, "EMAIL_IN_USE", "An account with this email already exists");
  }
  const temporaryPassword = randomBytes(48).toString("base64url");
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  try {
    const user = await prisma.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
          companyId,
          employeeCode: input.employeeCode,
          department: input.department || null,
          designation: input.designation || null,
          mobile: input.mobile || null,
          alternateEmail: input.alternateEmail || null,
          dateOfJoining: input.dateOfJoining ? new Date(input.dateOfJoining) : null,
        },
      });
      await transaction.userCompanyRole.create({
        data: { userId: created.id, companyId, roleId: role.id },
      });
      await writeAudit(
        request,
        "users.created",
        {
          module: "users",
          entityType: "user",
          entityId: created.id,
          newValue: { ...userAuditView(created), roles: [{ id: role.id, name: role.name }] },
        },
        transaction,
      );
      await writeAudit(
        request,
        "users.role-assigned",
        {
          module: "users",
          entityType: "user",
          entityId: created.id,
          newValue: { roleIds: [role.id] },
        },
        transaction,
      );
      return created;
    });
    const resetToken = await issuePasswordResetToken(
      request,
      { id: user.id, email: user.email },
      "users.reset-password",
    );
    response.status(201).json(
      createSuccess(
        {
          user: userAuditView(user),
          role,
          ...(process.env["NODE_ENV"] !== "production" ? { resetToken } : {}),
        },
        "User created",
        request.requestId,
      ),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = error.meta?.["target"];
      const emailConflict = Array.isArray(target) && target.includes("email");
      throw new AppError(
        409,
        emailConflict ? "EMAIL_IN_USE" : "EMPLOYEE_CODE_IN_USE",
        emailConflict
          ? "An account with this email already exists"
          : "Employee code is already in use in this company",
      );
    }
    throw error;
  }
});

usersRouter.get(
  "/:id/activity-log",
  ...scoped,
  requirePermission("users.activity.read"),
  async (request, response) => {
    const id = ensureId(request.params);
    const query = paginationSchema.parse(request.query);
    const companyId = request.auth!.companyId!;
    const user = await prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "User was not found in this company");
    const where = {
      userId: user.id,
      companyId,
      ...(query.search ? { action: { contains: query.search, mode: "insensitive" as const } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          action: true,
          module: true,
          entityType: true,
          entityId: true,
          createdAt: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ]);
    response.json(
      createSuccess(
        {
          items,
          page: query.page,
          pageSize: query.pageSize,
          total,
          pageCount: Math.ceil(total / query.pageSize),
        },
        "User activity",
        request.requestId,
      ),
    );
  },
);

usersRouter.get("/:id", ...scoped, requirePermission("users.read"), async (request, response) => {
  const id = ensureId(request.params);
  const user = await prisma.user.findFirst({
    where: { id, companyId: request.auth!.companyId!, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      employeeCode: true,
      department: true,
      designation: true,
      mobile: true,
      alternateEmail: true,
      dateOfJoining: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      companyRoles: {
        where: { companyId: request.auth!.companyId!, isActive: true, role: { isActive: true } },
        select: { role: { select: { id: true, name: true } } },
      },
    },
  });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User was not found in this company");
  response.json(
    createSuccess(
      { ...user, roles: user.companyRoles.map((membership) => membership.role) },
      "User",
      request.requestId,
    ),
  );
});

usersRouter.put(
  "/:id/roles",
  ...scoped,
  requirePermission("users.update"),
  async (request, response) => {
    const id = ensureId(request.params);
    const { roleIds } = assignUserRolesSchema.parse(request.body);
    const companyId = request.auth!.companyId!;
    const user = await prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "User was not found in this company");
    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds }, companyId, isActive: true },
      select: { id: true, name: true },
    });
    if (roles.length !== roleIds.length) {
      throw new AppError(
        400,
        "ROLE_INVALID",
        "Every role must be active and belong to this company",
      );
    }
    const memberships = await prisma.$transaction(async (transaction) => {
      const current = await transaction.userCompanyRole.findMany({
        where: { userId: user.id, companyId, isActive: true },
        select: { roleId: true },
      });
      await transaction.userCompanyRole.updateMany({
        where: {
          userId: user.id,
          companyId,
          isActive: true,
          ...(roleIds.length ? { roleId: { notIn: roleIds } } : {}),
        },
        data: { isActive: false },
      });
      for (const roleId of roleIds) {
        await transaction.userCompanyRole.upsert({
          where: { userId_companyId_roleId: { userId: user.id, companyId, roleId } },
          update: { isActive: true },
          create: { userId: user.id, companyId, roleId, isActive: true },
        });
      }
      await writeAudit(
        request,
        "users.roles-updated",
        {
          module: "users",
          entityType: "user",
          entityId: user.id,
          oldValue: { roleIds: current.map((membership) => membership.roleId) },
          newValue: { roleIds },
        },
        transaction,
      );
      return transaction.userCompanyRole.findMany({
        where: { userId: user.id, companyId, isActive: true, role: { isActive: true } },
        select: { role: { select: { id: true, name: true } } },
      });
    });
    response.json(
      createSuccess(
        { roles: memberships.map((membership) => membership.role) },
        "User roles updated",
        request.requestId,
      ),
    );
  },
);

usersRouter.put("/:id", ...scoped, requirePermission("users.update"), async (request, response) => {
  const id = ensureId(request.params);
  const input = updateUserSchema.parse(request.body);
  const companyId = request.auth!.companyId!;
  try {
    const user = await prisma.$transaction(async (transaction) => {
      const current = await transaction.user.findFirst({
        where: { id, companyId, deletedAt: null },
      });
      if (!current) throw new AppError(404, "USER_NOT_FOUND", "User was not found in this company");
      const updated = await transaction.user.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.email === undefined ? {} : { email: input.email }),
          ...(input.employeeCode === undefined ? {} : { employeeCode: input.employeeCode }),
          ...(input.department === undefined ? {} : { department: input.department || null }),
          ...(input.designation === undefined ? {} : { designation: input.designation || null }),
          ...(input.mobile === undefined ? {} : { mobile: input.mobile || null }),
          ...(input.alternateEmail === undefined
            ? {}
            : { alternateEmail: input.alternateEmail || null }),
          ...(input.dateOfJoining === undefined
            ? {}
            : { dateOfJoining: input.dateOfJoining ? new Date(input.dateOfJoining) : null }),
        },
      });
      await writeAudit(
        request,
        "users.updated",
        {
          module: "users",
          entityType: "user",
          entityId: id,
          oldValue: userAuditView(current),
          newValue: userAuditView(updated),
        },
        transaction,
      );
      return updated;
    });
    response.json(createSuccess(userAuditView(user), "User updated", request.requestId));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "EMPLOYEE_CODE_IN_USE", "Employee code or email is already in use");
    }
    throw error;
  }
});

usersRouter.delete(
  "/:id",
  ...scoped,
  requirePermission("users.delete"),
  async (request, response) => {
    const id = ensureId(request.params);
    const companyId = request.auth!.companyId!;
    await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({ where: { id, companyId, deletedAt: null } });
      if (!user) throw new AppError(404, "USER_NOT_FOUND", "User was not found in this company");
      if (user.id === request.auth!.userId) {
        throw new AppError(
          400,
          "SELF_DEACTIVATION_DENIED",
          "You cannot deactivate your own account",
        );
      }
      const now = new Date();
      await transaction.user.update({ where: { id }, data: { isActive: false, deletedAt: now } });
      await transaction.userCompanyRole.updateMany({
        where: { userId: id, companyId, isActive: true },
        data: { isActive: false },
      });
      await transaction.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      });
      await writeAudit(
        request,
        "users.deleted",
        {
          module: "users",
          entityType: "user",
          entityId: id,
          oldValue: userAuditView(user),
          newValue: { isActive: false, deletedAt: now.toISOString() },
        },
        transaction,
      );
    });
    response.json(createSuccess({ id, deleted: true }, "User deactivated", request.requestId));
  },
);

usersRouter.post(
  "/:id/reset-password",
  ...scoped,
  requirePermission("users.reset-password"),
  async (request, response) => {
    const id = ensureId(request.params);
    const user = await prisma.user.findFirst({
      where: { id, companyId: request.auth!.companyId!, deletedAt: null, isActive: true },
      select: { id: true, email: true },
    });
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "User was not found in this company");
    const resetToken = await issuePasswordResetToken(request, user, "users.reset-password");
    response.json(
      createSuccess(
        { ...(process.env["NODE_ENV"] !== "production" ? { resetToken } : {}) },
        "Password reset instructions queued",
        request.requestId,
      ),
    );
  },
);
