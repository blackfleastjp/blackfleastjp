import type { Request } from "express";
import { prisma } from "../lib/prisma.js";

export async function writeAudit(
  request: Request,
  action: string,
  values: {
    userId?: string | null;
    companyId?: string | null;
    entityType?: string;
    entityId?: string;
    metadata?: object;
  } = {},
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: values.userId ?? request.auth?.userId ?? null,
      companyId: values.companyId ?? request.auth?.companyId ?? null,
      action,
      entityType: values.entityType ?? null,
      entityId: values.entityId ?? null,
      metadata: values.metadata ?? {},
      requestId: request.requestId,
      ipAddress: request.ip ?? null,
    },
  });
}
