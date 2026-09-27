import type { Request } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

type AuditClient = PrismaClient | Prisma.TransactionClient;

export async function writeAudit(
  request: Request,
  action: string,
  values: {
    userId?: string | null;
    companyId?: string | null;
    entityType?: string;
    entityId?: string;
    module?: string;
    oldValue?: Prisma.InputJsonValue;
    newValue?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
  } = {},
  client: AuditClient = prisma,
): Promise<void> {
  const userId = values.userId === undefined ? (request.auth?.userId ?? null) : values.userId;
  const companyId =
    values.companyId === undefined ? (request.auth?.companyId ?? null) : values.companyId;
  await client.auditLog.create({
    data: {
      userId,
      companyId,
      action,
      module: values.module ?? null,
      entityType: values.entityType ?? null,
      entityId: values.entityId ?? null,
      metadata: values.metadata ?? {},
      ...(values.oldValue === undefined ? {} : { oldValue: values.oldValue }),
      ...(values.newValue === undefined ? {} : { newValue: values.newValue }),
      requestId: request.requestId,
      ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent")?.slice(0, 500) ?? null,
    },
  });
}
