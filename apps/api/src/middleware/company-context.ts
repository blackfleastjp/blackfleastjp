import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError, unauthorized } from "../lib/errors.js";
import { companyIdParamsSchema } from "@erp/validation";

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
        company: { isActive: true },
        user: { isActive: true },
        role: { companyId },
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
