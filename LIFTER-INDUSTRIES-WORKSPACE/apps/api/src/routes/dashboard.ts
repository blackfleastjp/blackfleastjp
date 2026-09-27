import { Router } from "express";
import { createSuccess } from "@erp/shared";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { requireCompanyContext } from "../middleware/company-context.js";
import { prisma } from "../lib/prisma.js";
import { paginationSchema } from "@erp/validation";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/summary",
  authenticate,
  requireCompanyContext,
  requirePermission("company.read"),
  async (request, response) => {
    const companyId = request.auth!.companyId!;
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 29);
    since.setUTCHours(0, 0, 0, 0);
    const [company, activeUsers, activityRows, auditLogs] = await Promise.all([
      prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { id: true, name: true, currency: true },
      }),
      prisma.user.count({
        where: {
          isActive: true,
          deletedAt: null,
          companyRoles: { some: { companyId, isActive: true, role: { isActive: true } } },
        },
      }),
      prisma.$queryRaw<Array<{ date: string; events: number }>>`
        SELECT TO_CHAR(DATE_TRUNC('day', "created_at" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
               COUNT(*)::int AS events
        FROM "audit_logs"
        WHERE "company_id" = ${companyId} AND "created_at" >= ${since}
        GROUP BY 1
        ORDER BY 1
      `,
      prisma.auditLog.findMany({
        where: { companyId, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, action: true, createdAt: true, user: { select: { name: true } } },
      }),
    ]);
    const dailyCounts = new Map<string, number>();
    for (let day = 0; day < 30; day += 1) {
      const date = new Date(since);
      date.setUTCDate(since.getUTCDate() + day);
      dailyCounts.set(date.toISOString().slice(0, 10), 0);
    }
    for (const row of activityRows) dailyCounts.set(row.date, row.events);
    const summary = {
      company,
      activeUsers,
      activity: [...dailyCounts].map(([date, events]) => ({ date, events })),
      recentActivity: auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        createdAt: log.createdAt.toISOString(),
        userName: log.user?.name ?? null,
      })),
    };
    response.json(createSuccess(summary, "Dashboard summary", request.requestId));
  },
);

dashboardRouter.get(
  "/users",
  authenticate,
  requireCompanyContext,
  requirePermission("users.read"),
  async (request, response) => {
    const query = paginationSchema.parse(request.query);
    const companyId = request.auth!.companyId!;
    const where = {
      companyId,
      isActive: true,
      role: { companyId, isActive: true },
      user: query.search
        ? {
            isActive: true,
            deletedAt: null,
            OR: [
              { name: { contains: query.search, mode: "insensitive" as const } },
              { email: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : { isActive: true, deletedAt: null },
    };
    const [members, total] = await Promise.all([
      prisma.userCompanyRole.findMany({
        where,
        orderBy: { user: { name: "asc" } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
          role: { select: { name: true } },
        },
      }),
      prisma.userCompanyRole.count({ where }),
    ]);
    response.json(
      createSuccess(
        {
          items: members.map((member) => ({
            id: member.user.id,
            name: member.user.name,
            email: member.user.email,
            role: member.role.name,
            joinedAt: member.createdAt.toISOString(),
          })),
          page: query.page,
          pageSize: query.pageSize,
          total,
          pageCount: Math.ceil(total / query.pageSize),
        },
        "Company users",
        request.requestId,
      ),
    );
  },
);

dashboardRouter.get(
  "/activity",
  authenticate,
  requireCompanyContext,
  requirePermission("audit.read"),
  async (request, response) => {
    const query = paginationSchema.parse(request.query);
    const where = {
      companyId: request.auth!.companyId!,
      ...(query.search ? { action: { contains: query.search, mode: "insensitive" as const } } : {}),
    };
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);
    response.json(
      createSuccess(
        {
          items: logs.map((log) => ({
            id: log.id,
            action: log.action,
            entityType: log.entityType,
            createdAt: log.createdAt.toISOString(),
            userName: log.user?.name ?? null,
          })),
          page: query.page,
          pageSize: query.pageSize,
          total,
          pageCount: Math.ceil(total / query.pageSize),
        },
        "Company activity",
        request.requestId,
      ),
    );
  },
);
