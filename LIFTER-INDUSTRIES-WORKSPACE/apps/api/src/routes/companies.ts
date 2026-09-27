import { Router } from "express";
import { Prisma } from "@prisma/client";
import { createSuccess, permissionDefinitions } from "@erp/shared";
import {
  companyFeaturesSchema,
  companyListSchema,
  companyRestoreSchema,
  createCompanySchema,
  paginationSchema,
  updateCompanySchema,
} from "@erp/validation";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";
import {
  requireCompanyContext,
  requireCompanyMembershipPermission,
  requireMatchingCompanyId,
} from "../middleware/company-context.js";

export const companiesRouter = Router();

function toCreateData(
  input: ReturnType<typeof createCompanySchema.parse>,
): Prisma.CompanyUncheckedCreateInput {
  return {
    name: input.name,
    code: input.code,
    legalName: input.legalName || null,
    address: input.address || null,
    city: input.city || null,
    state: input.state || null,
    pincode: input.pincode || null,
    country: input.country,
    gstin: input.gstin || null,
    pan: input.pan || null,
    email: input.email || null,
    phone: input.phone || null,
    logo: input.logo || null,
    financialYearStart: input.financialYearStart ? new Date(input.financialYearStart) : null,
    financialYearEnd: input.financialYearEnd ? new Date(input.financialYearEnd) : null,
    booksBeginningDate: input.booksBeginningDate ? new Date(input.booksBeginningDate) : null,
    baseCurrency: input.baseCurrency,
    currency: input.baseCurrency,
    timezone: input.timezone,
  };
}

function toUpdateData(
  input: ReturnType<typeof updateCompanySchema.parse>,
): Prisma.CompanyUpdateInput {
  return {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.code === undefined ? {} : { code: input.code }),
    ...(input.legalName === undefined ? {} : { legalName: input.legalName || null }),
    ...(input.address === undefined ? {} : { address: input.address || null }),
    ...(input.city === undefined ? {} : { city: input.city || null }),
    ...(input.state === undefined ? {} : { state: input.state || null }),
    ...(input.pincode === undefined ? {} : { pincode: input.pincode || null }),
    ...(input.country === undefined ? {} : { country: input.country }),
    ...(input.gstin === undefined ? {} : { gstin: input.gstin || null }),
    ...(input.pan === undefined ? {} : { pan: input.pan || null }),
    ...(input.email === undefined ? {} : { email: input.email || null }),
    ...(input.phone === undefined ? {} : { phone: input.phone || null }),
    ...(input.logo === undefined ? {} : { logo: input.logo || null }),
    ...(input.financialYearStart === undefined
      ? {}
      : {
          financialYearStart: input.financialYearStart ? new Date(input.financialYearStart) : null,
        }),
    ...(input.financialYearEnd === undefined
      ? {}
      : { financialYearEnd: input.financialYearEnd ? new Date(input.financialYearEnd) : null }),
    ...(input.booksBeginningDate === undefined
      ? {}
      : {
          booksBeginningDate: input.booksBeginningDate ? new Date(input.booksBeginningDate) : null,
        }),
    ...(input.baseCurrency === undefined
      ? {}
      : { baseCurrency: input.baseCurrency, currency: input.baseCurrency }),
    ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
  };
}

function companyAuditView(company: {
  id: string;
  name: string;
  code: string;
  legalName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string | null;
  financialYearStart: Date | null;
  financialYearEnd: Date | null;
  booksBeginningDate: Date | null;
  baseCurrency: string;
  timezone: string;
  isActive: boolean;
}) {
  return {
    ...company,
    financialYearStart: company.financialYearStart?.toISOString().slice(0, 10) ?? null,
    financialYearEnd: company.financialYearEnd?.toISOString().slice(0, 10) ?? null,
    booksBeginningDate: company.booksBeginningDate?.toISOString().slice(0, 10) ?? null,
  };
}

companiesRouter.get("/", authenticate, async (request, response) => {
  const query = companyListSchema.parse(request.query);
  const where: Prisma.CompanyWhereInput = {
    userRoles: {
      some: {
        userId: request.auth!.userId,
        isActive: true,
        user: { isActive: true, deletedAt: null },
        role: { isActive: true },
      },
    },
    ...(query.status === "active" ? { isActive: true, deletedAt: null } : {}),
    ...(query.status === "inactive" ? { isActive: false, deletedAt: null } : {}),
    ...(query.status === "deleted" ? { deletedAt: { not: null } } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { code: { contains: query.search, mode: "insensitive" } },
            { gstin: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(query.city ? { city: { contains: query.city, mode: "insensitive" } } : {}),
    ...(query.state ? { state: { contains: query.state, mode: "insensitive" } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        name: true,
        code: true,
        city: true,
        state: true,
        baseCurrency: true,
        isActive: true,
        deletedAt: true,
        createdAt: true,
      },
    }),
    prisma.company.count({ where }),
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
      "Companies",
      request.requestId,
    ),
  );
});

companiesRouter.post(
  "/",
  authenticate,
  requireCompanyContext,
  requirePermission("company.create"),
  async (request, response) => {
    const input = createCompanySchema.parse(request.body);
    try {
      const company = await prisma.$transaction(async (transaction) => {
        const created = await transaction.company.create({ data: toCreateData(input) });
        const administrator = await transaction.role.create({
          data: {
            companyId: created.id,
            name: "Administrator",
            description: "Full access to this company",
            isSystem: true,
            permissions: {
              create: permissionDefinitions.map((permission) => ({
                permission: {
                  connectOrCreate: {
                    where: { key: permission.key },
                    create: { ...permission, description: permission.name },
                  },
                },
              })),
            },
          },
        });
        await transaction.userCompanyRole.create({
          data: { userId: request.auth!.userId, companyId: created.id, roleId: administrator.id },
        });
        await writeAudit(
          request,
          "company.created",
          {
            companyId: created.id,
            module: "company",
            entityType: "company",
            entityId: created.id,
            newValue: companyAuditView(created),
          },
          transaction,
        );
        return created;
      });
      response.status(201).json(createSuccess(company, "Company created", request.requestId));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(
          409,
          "COMPANY_UNIQUE_CONFLICT",
          "Company code, GSTIN, or PAN is already in use",
        );
      }
      throw error;
    }
  },
);

companiesRouter.get(
  "/:id/features",
  authenticate,
  requireCompanyContext,
  requireMatchingCompanyId,
  requirePermission("company.read"),
  async (request, response) => {
    const company = await prisma.company.findFirst({
      where: { id: request.auth!.companyId!, deletedAt: null },
      select: { featureConfiguration: true },
    });
    if (!company) throw new AppError(404, "COMPANY_NOT_FOUND", "Company was not found");
    response.json(
      createSuccess(company.featureConfiguration, "Company features", request.requestId),
    );
  },
);

companiesRouter.put(
  "/:id/features",
  authenticate,
  requireCompanyContext,
  requireMatchingCompanyId,
  requirePermission("company.features.update"),
  async (request, response) => {
    const features = companyFeaturesSchema.parse(request.body);
    const companyId = request.auth!.companyId!;
    const company = await prisma.$transaction(async (transaction) => {
      const current = await transaction.company.findFirst({
        where: { id: companyId, deletedAt: null },
      });
      if (!current) throw new AppError(404, "COMPANY_NOT_FOUND", "Company was not found");
      const updated = await transaction.company.update({
        where: { id: companyId },
        data: { featureConfiguration: features },
        select: { id: true, featureConfiguration: true },
      });
      await writeAudit(
        request,
        "company.features.updated",
        {
          module: "company",
          entityType: "company",
          entityId: companyId,
          oldValue: current.featureConfiguration as Prisma.InputJsonValue,
          newValue: features,
        },
        transaction,
      );
      return updated;
    });
    response.json(createSuccess(company, "Company features updated", request.requestId));
  },
);

companiesRouter.get(
  "/:id/backup",
  authenticate,
  requireCompanyContext,
  requireMatchingCompanyId,
  requirePermission("company.backup"),
  async (request, response) => {
    const query = paginationSchema.parse(request.query);
    const where = {
      companyId: request.auth!.companyId!,
      type: "COMPANY_BACKUP" as const,
    };
    const [items, total] = await Promise.all([
      prisma.backgroundJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          status: true,
          error: true,
          result: true,
          createdAt: true,
          finishedAt: true,
        },
      }),
      prisma.backgroundJob.count({ where }),
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
        "Company backups",
        request.requestId,
      ),
    );
  },
);

companiesRouter.post(
  "/:id/backup",
  authenticate,
  requireCompanyContext,
  requireMatchingCompanyId,
  requirePermission("company.backup"),
  async (request, response) => {
    const companyId = request.auth!.companyId!;
    const job = await prisma.$transaction(async (transaction) => {
      const created = await transaction.backgroundJob.create({
        data: { companyId, requestedBy: request.auth!.userId, type: "COMPANY_BACKUP" },
      });
      await writeAudit(
        request,
        "company.backup.queued",
        {
          module: "company",
          entityType: "background_job",
          entityId: created.id,
          newValue: { status: created.status },
        },
        transaction,
      );
      return created;
    });
    response.status(202).json(createSuccess(job, "Company backup queued", request.requestId));
  },
);

companiesRouter.post(
  "/:id/restore",
  authenticate,
  requireCompanyContext,
  requireMatchingCompanyId,
  requirePermission("company.restore"),
  async (request, response) => {
    const input = companyRestoreSchema.parse(request.body);
    const companyId = request.auth!.companyId!;
    const source = await prisma.backgroundJob.findFirst({
      where: { id: input.jobId, companyId, type: "COMPANY_BACKUP", status: "COMPLETED" },
      select: { id: true },
    });
    if (!source) throw new AppError(404, "BACKUP_NOT_FOUND", "Completed backup was not found");
    const job = await prisma.$transaction(async (transaction) => {
      const created = await transaction.backgroundJob.create({
        data: {
          companyId,
          requestedBy: request.auth!.userId,
          type: "COMPANY_RESTORE",
          payload: { sourceJobId: source.id },
        },
      });
      await writeAudit(
        request,
        "company.restore.queued",
        {
          module: "company",
          entityType: "background_job",
          entityId: created.id,
          newValue: { sourceJobId: source.id },
        },
        transaction,
      );
      return created;
    });
    response.status(202).json(createSuccess(job, "Company restore queued", request.requestId));
  },
);

companiesRouter.post(
  "/:id/activate",
  authenticate,
  requireCompanyMembershipPermission("company.activate"),
  async (request, response) => {
    const companyId = request.auth!.companyId!;
    const company = await prisma.$transaction(async (transaction) => {
      const current = await transaction.company.findUnique({ where: { id: companyId } });
      if (!current) throw new AppError(404, "COMPANY_NOT_FOUND", "Company was not found");
      if (current.isActive) return current;
      const updated = await transaction.company.update({
        where: { id: companyId },
        data: { isActive: true, deletedAt: null },
      });
      await writeAudit(
        request,
        "company.activated",
        {
          module: "company",
          entityType: "company",
          entityId: companyId,
          oldValue: {
            isActive: current.isActive,
            deletedAt: current.deletedAt?.toISOString() ?? null,
          },
          newValue: { isActive: true, deletedAt: null },
        },
        transaction,
      );
      return updated;
    });
    response.json(createSuccess(company, "Company activated", request.requestId));
  },
);

companiesRouter.get(
  "/:id",
  authenticate,
  requireCompanyContext,
  requireMatchingCompanyId,
  requirePermission("company.read"),
  async (request, response) => {
    const company = await prisma.company.findFirst({
      where: { id: request.auth!.companyId!, deletedAt: null },
    });
    if (!company) throw new AppError(404, "COMPANY_NOT_FOUND", "Company was not found");
    response.json(createSuccess(company, "Company", request.requestId));
  },
);

companiesRouter.put(
  "/:id",
  authenticate,
  requireCompanyContext,
  requireMatchingCompanyId,
  requirePermission("company.update"),
  async (request, response) => {
    const input = updateCompanySchema.parse(request.body);
    const companyId = request.auth!.companyId!;
    try {
      const company = await prisma.$transaction(async (transaction) => {
        const current = await transaction.company.findFirst({
          where: { id: companyId, deletedAt: null },
        });
        if (!current) throw new AppError(404, "COMPANY_NOT_FOUND", "Company was not found");
        const gstin = input.gstin === undefined ? current.gstin : input.gstin || null;
        const pan = input.pan === undefined ? current.pan : input.pan || null;
        if (gstin && pan && gstin.slice(2, 12) !== pan) {
          throw new AppError(400, "GSTIN_PAN_MISMATCH", "GSTIN must contain the supplied PAN");
        }
        const financialYearStart =
          input.financialYearStart === undefined
            ? current.financialYearStart?.toISOString().slice(0, 10)
            : input.financialYearStart || null;
        const financialYearEnd =
          input.financialYearEnd === undefined
            ? current.financialYearEnd?.toISOString().slice(0, 10)
            : input.financialYearEnd || null;
        if (financialYearStart && financialYearEnd && financialYearStart >= financialYearEnd) {
          throw new AppError(400, "FINANCIAL_YEAR_INVALID", "Financial year end must follow its start");
        }
        const updated = await transaction.company.update({
          where: { id: companyId },
          data: toUpdateData(input),
        });
        await writeAudit(
          request,
          "company.updated",
          {
            module: "company",
            entityType: "company",
            entityId: companyId,
            oldValue: companyAuditView(current),
            newValue: companyAuditView(updated),
          },
          transaction,
        );
        return updated;
      });
      response.json(createSuccess(company, "Company updated", request.requestId));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(
          409,
          "COMPANY_UNIQUE_CONFLICT",
          "Company code, GSTIN, or PAN is already in use",
        );
      }
      throw error;
    }
  },
);

companiesRouter.delete(
  "/:id",
  authenticate,
  requireCompanyContext,
  requireMatchingCompanyId,
  requirePermission("company.delete"),
  async (request, response) => {
    const companyId = request.auth!.companyId!;
    await prisma.$transaction(async (transaction) => {
      const current = await transaction.company.findFirst({
        where: { id: companyId, deletedAt: null },
      });
      if (!current) throw new AppError(404, "COMPANY_NOT_FOUND", "Company was not found");
      const now = new Date();
      await transaction.company.update({
        where: { id: companyId },
        data: { isActive: false, deletedAt: now },
      });
      await writeAudit(
        request,
        "company.deleted",
        {
          module: "company",
          entityType: "company",
          entityId: companyId,
          oldValue: { isActive: current.isActive, deletedAt: null },
          newValue: { isActive: false, deletedAt: now.toISOString() },
        },
        transaction,
      );
    });
    response.json(
      createSuccess({ id: companyId, deleted: true }, "Company deactivated", request.requestId),
    );
  },
);
