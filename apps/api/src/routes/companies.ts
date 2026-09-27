import { Router } from "express";
import { createSuccess } from "@erp/shared";
import { paginationSchema } from "@erp/validation";
import { authenticate } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

export const companiesRouter = Router();

companiesRouter.get("/", authenticate, async (request, response) => {
  const query = paginationSchema.parse(request.query);
  const where = {
    userRoles: { some: { userId: request.auth!.userId, user: { isActive: true } } },
    isActive: true,
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
  };
  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: { id: true, name: true, currency: true, timezone: true },
    }),
    prisma.company.count({ where }),
  ]);
  response.json(
    createSuccess(
      {
        items: companies,
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
