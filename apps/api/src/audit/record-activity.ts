import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import type { prisma } from '../db/prisma';

type ActivityData = {
  companyId?: string;
  entity: string;
  entityId: string;
  action: string;
  details?: Prisma.InputJsonValue;
};

export async function recordActivity(
  database: Prisma.TransactionClient | typeof prisma,
  request: Request,
  activity: ActivityData,
): Promise<void> {
  if (!request.auth) throw new Error('Authenticated context is required to record activity.');
  await database.activityLog.create({
    data: {
      companyId: activity.companyId ?? request.auth.companyId,
      actorUserId: request.auth.userId,
      entity: activity.entity,
      entityId: activity.entityId,
      action: activity.action,
      details: activity.details,
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    },
  });
}
