import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError, unauthorized } from "../lib/errors.js";
import { companyIdParamsSchema, idParamsSchema } from "@erp/validation";
import { permissionAllows } from "@erp/shared";

export const requireCompanyContext: RequestHandler = async (request, _response, next) => {
  if (!request.auth) return next(unauthorized());
  const companyId = request.header("X-Company-Id");
  if (!companyId)
    return next(new AppError(400, "COMPANY_REQUIRED", "Select a company to continue"));
  const parsedCompany = companyIdParamsSchema.safeParse({ companyId });
  if (!parsedCompany.success)
    return next(new AppError(400, "INVALID_COMPANY", "Company context is invalid"));

  try {
    const memberships = await prisma.userCompanyRole.findMany({
      where: {
        userId: request.auth.userId,
        companyId,
        isActive: true,
        company: { isActive: true, deletedAt: null },
        user: { isActive: true, deletedAt: null },
        role: { companyId, isActive: true },
      },
      select: {
        role: { select: { permissions: { select: { permission: { select: { key: true } } } } } },
      },
    });
    if (memberships.length === 0)
      return next(new AppError(403, "COMPANY_FORBIDDEN", "You do not have access to this company"));
    const permissions = new Set(
      memberships.flatMap((membership) =>
        membership.role.permissions.map((item) => item.permission.key),
      ),
    );
    request.auth.companyId = companyId;
    request.auth.permissions = permissions;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireMatchingCompanyId: RequestHandler = (request, _response, next) => {
  const parsed = idParamsSchema.safeParse(request.params);
  if (!parsed.success)
    return next(new AppError(400, "INVALID_COMPANY_ID", "Company ID is invalid"));
  if (!request.auth?.companyId) return next(unauthorized("Company context is required"));
  if (parsed.data.id !== request.auth.companyId) {
    return next(new AppError(404, "COMPANY_NOT_FOUND", "Company was not found"));
  }
  next();
};

export function requireCompanyMembershipPermission(permission: string): RequestHandler {
  return async (request, _response, next) => {
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success)
      return next(new AppError(400, "INVALID_COMPANY_ID", "Company ID is invalid"));
    if (!request.auth) return next(unauthorized());
    try {
      const memberships = await prisma.userCompanyRole.findMany({
        where: {
          userId: request.auth.userId,
          companyId: parsed.data.id,
          isActive: true,
          user: { isActive: true, deletedAt: null },
          role: { companyId: parsed.data.id, isActive: true },
        },
        select: {
          role: {
            select: {
              permissions: { select: { permission: { select: { key: true } } } },
            },
          },
        },
      });
      if (memberships.length === 0) {
        return next(new AppError(404, "COMPANY_NOT_FOUND", "Company was not found"));
      }
      const permissions = new Set(
        memberships.flatMap((membership) =>
          membership.role.permissions.map((item) => item.permission.key),
        ),
      );
      if (!permissionAllows(permissions, permission)) {
        return next(
          new AppError(
            403,
            "PERMISSION_DENIED",
            "You do not have permission to activate this company",
          ),
        );
      }
      request.auth.companyId = parsed.data.id;
      request.auth.permissions = permissions;
      next();
    } catch (error) {
      next(error);
    }
  };
}
