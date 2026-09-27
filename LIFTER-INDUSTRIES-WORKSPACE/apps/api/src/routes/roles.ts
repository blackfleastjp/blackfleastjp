import { Router } from "express";
import { Prisma } from "@prisma/client";
import { createSuccess } from "@erp/shared";
import {
  assignRolePermissionsSchema,
  createRoleSchema,
  idParamsSchema,
  permissionListSchema,
  roleListSchema,
  updateRoleSchema,
} from "@erp/validation";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";
import { requireCompanyContext } from "../middleware/company-context.js";

export const rolesRouter = Router();
export const permissionsRouter = Router();
const scoped = [authenticate, requireCompanyContext] as const;

async function listPermissions(
  request: import("express").Request,
  response: import("express").Response,
) {
  const query = permissionListSchema.parse(request.query);
  const permissions = await prisma.permission.findMany({
    where: query.module ? { module: query.module } : {},
    orderBy: [{ module: "asc" }, { action: "asc" }],
    select: { id: true, key: true, name: true, module: true, action: true, description: true },
  });
  response.json(createSuccess(permissions, "Permissions", request.requestId));
}

permissionsRouter.get("/", ...scoped, requirePermission("permissions.read"), listPermissions);

function roleIdFrom(request: { params: Record<string, string | string[] | undefined> }): string {
  return idParamsSchema.parse(request.params).id;
}

rolesRouter.get("/permissions", ...scoped, requirePermission("permissions.read"), listPermissions);

rolesRouter.get("/", ...scoped, requirePermission("roles.read"), async (request, response) => {
  const query = roleListSchema.parse(request.query);
  const companyId = request.auth!.companyId!;
  const where: Prisma.RoleWhereInput = {
    companyId,
    ...(query.status === "active" ? { isActive: true } : {}),
    ...(query.status === "inactive" ? { isActive: false } : {}),
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.role.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        isSystem: true,
        createdAt: true,
        _count: { select: { permissions: true, userRoles: { where: { isActive: true } } } },
      },
    }),
    prisma.role.count({ where }),
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
      "Roles",
      request.requestId,
    ),
  );
});

rolesRouter.post("/", ...scoped, requirePermission("roles.create"), async (request, response) => {
  const input = createRoleSchema.parse(request.body);
  const companyId = request.auth!.companyId!;
  try {
    const role = await prisma.$transaction(async (transaction) => {
      const created = await transaction.role.create({
        data: { companyId, name: input.name, description: input.description || null },
      });
      await writeAudit(
        request,
        "roles.created",
        {
          module: "roles",
          entityType: "role",
          entityId: created.id,
          newValue: { name: created.name, description: created.description },
        },
        transaction,
      );
      return created;
    });
    response.status(201).json(createSuccess(role, "Role created", request.requestId));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(
        409,
        "ROLE_NAME_IN_USE",
        "A role with this name already exists in this company",
      );
    }
    throw error;
  }
});

rolesRouter.get("/:id", ...scoped, requirePermission("roles.read"), async (request, response) => {
  const id = roleIdFrom(request);
  const role = await prisma.role.findFirst({
    where: { id, companyId: request.auth!.companyId! },
    select: {
      id: true,
      name: true,
      description: true,
      isActive: true,
      isSystem: true,
      createdAt: true,
      updatedAt: true,
      permissions: {
        select: {
          permission: { select: { id: true, key: true, name: true, module: true, action: true } },
        },
        orderBy: { permission: { module: "asc" } },
      },
    },
  });
  if (!role) throw new AppError(404, "ROLE_NOT_FOUND", "Role was not found in this company");
  response.json(
    createSuccess(
      { ...role, permissions: role.permissions.map((item) => item.permission) },
      "Role",
      request.requestId,
    ),
  );
});

rolesRouter.put(
  "/:id/assign-permissions",
  ...scoped,
  requirePermission("roles.assign-permissions"),
  async (request, response) => {
    const id = roleIdFrom(request);
    const input = assignRolePermissionsSchema.parse(request.body);
    const companyId = request.auth!.companyId!;
    const permissionRows = await prisma.permission.findMany({
      where: { id: { in: input.permissionIds } },
      select: { id: true, key: true, module: true, action: true },
    });
    if (permissionRows.length !== input.permissionIds.length) {
      throw new AppError(400, "PERMISSION_INVALID", "One or more permissions do not exist");
    }
    const role = await prisma.$transaction(async (transaction) => {
      const current = await transaction.role.findFirst({
        where: { id, companyId },
        include: { permissions: { select: { permission: { select: { id: true, key: true } } } } },
      });
      if (!current) throw new AppError(404, "ROLE_NOT_FOUND", "Role was not found in this company");
      if (current.isSystem) {
        throw new AppError(
          403,
          "SYSTEM_ROLE_PROTECTED",
          "System role permissions cannot be changed",
        );
      }
      await transaction.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissionRows.length) {
        await transaction.rolePermission.createMany({
          data: permissionRows.map((permission) => ({ roleId: id, permissionId: permission.id })),
        });
      }
      await writeAudit(
        request,
        "roles.permissions-updated",
        {
          module: "roles",
          entityType: "role",
          entityId: id,
          oldValue: { permissionKeys: current.permissions.map((item) => item.permission.key) },
          newValue: { permissionKeys: permissionRows.map((item) => item.key) },
        },
        transaction,
      );
      return transaction.role.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          name: true,
          permissions: {
            select: {
              permission: {
                select: { id: true, key: true, name: true, module: true, action: true },
              },
            },
          },
        },
      });
    });
    response.json(
      createSuccess(
        { ...role, permissions: role.permissions.map((item) => item.permission) },
        "Role permissions updated",
        request.requestId,
      ),
    );
  },
);

rolesRouter.put("/:id", ...scoped, requirePermission("roles.update"), async (request, response) => {
  const id = roleIdFrom(request);
  const input = updateRoleSchema.parse(request.body);
  const companyId = request.auth!.companyId!;
  try {
    const role = await prisma.$transaction(async (transaction) => {
      const current = await transaction.role.findFirst({ where: { id, companyId } });
      if (!current) throw new AppError(404, "ROLE_NOT_FOUND", "Role was not found in this company");
      if (current.isSystem && input.isActive === false) {
        throw new AppError(403, "SYSTEM_ROLE_PROTECTED", "System roles cannot be deactivated");
      }
      const updated = await transaction.role.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description || null }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
      });
      if (input.isActive === false) {
        await transaction.userCompanyRole.updateMany({
          where: { roleId: id, companyId, isActive: true },
          data: { isActive: false },
        });
      }
      await writeAudit(
        request,
        input.isActive === false ? "roles.deactivated" : "roles.updated",
        {
          module: "roles",
          entityType: "role",
          entityId: id,
          oldValue: {
            name: current.name,
            description: current.description,
            isActive: current.isActive,
          },
          newValue: {
            name: updated.name,
            description: updated.description,
            isActive: updated.isActive,
          },
        },
        transaction,
      );
      return updated;
    });
    response.json(createSuccess(role, "Role updated", request.requestId));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(
        409,
        "ROLE_NAME_IN_USE",
        "A role with this name already exists in this company",
      );
    }
    throw error;
  }
});

rolesRouter.delete(
  "/:id",
  ...scoped,
  requirePermission("roles.delete"),
  async (request, response) => {
    const id = roleIdFrom(request);
    const companyId = request.auth!.companyId!;
    await prisma.$transaction(async (transaction) => {
      const role = await transaction.role.findFirst({ where: { id, companyId } });
      if (!role) throw new AppError(404, "ROLE_NOT_FOUND", "Role was not found in this company");
      if (role.isSystem)
        throw new AppError(403, "SYSTEM_ROLE_PROTECTED", "System roles cannot be deleted");
      await transaction.role.update({ where: { id }, data: { isActive: false } });
      await transaction.userCompanyRole.updateMany({
        where: { roleId: id, companyId, isActive: true },
        data: { isActive: false },
      });
      await writeAudit(
        request,
        "roles.deleted",
        {
          module: "roles",
          entityType: "role",
          entityId: id,
          oldValue: { name: role.name, isActive: true },
          newValue: { isActive: false },
        },
        transaction,
      );
    });
    response.json(createSuccess({ id, deleted: true }, "Role deactivated", request.requestId));
  },
);
