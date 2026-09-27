import type { RequestHandler } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { HttpError } from '../utils/http-error';

export const authenticate: RequestHandler = async (request, _response, next) => {
  const authorization = request.header('authorization');
  const [scheme, token] = authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) {
    next(new HttpError(401, 'Authentication is required.'));
    return;
  }

  try {
    const payload = jwt.verify(token, env.ACCESS_TOKEN_SECRET);
    if (
      typeof payload === 'string' ||
      payload.tokenType !== 'access' ||
      typeof payload.sub !== 'string'
    ) {
      throw new HttpError(401, 'The access token is invalid.');
    }

    // Resolve current grants from the database so role changes apply without waiting for JWT expiry.
    const companyHeader = request.header('x-company-id');
    if (companyHeader && !z.string().uuid().safeParse(companyHeader).success) {
      throw new HttpError(400, 'The company context header must be a valid UUID.');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        userCompanyRoles: {
          include: { role: { include: { permissions: true } } },
        },
      },
    });
    if (!user?.isActive) throw new HttpError(401, 'The user account is unavailable.');

    const companyId = companyHeader ?? user.companyId;
    const memberships = user.userCompanyRoles.filter(
      ({ companyId: memberCompanyId }) => memberCompanyId === companyId,
    );
    if (memberships.length === 0) {
      throw new HttpError(403, 'You do not have access to the selected company.');
    }

    request.auth = {
      userId: user.id,
      companyId,
      roleIds: [...new Set(memberships.map(({ roleId }) => roleId))],
      permissions: [
        ...new Set(
          memberships.flatMap(({ role }) =>
            role.permissions.map(({ module, action }) => `${module}:${action}`),
          ),
        ),
      ],
    };
    next();
  } catch (error) {
    next(
      error instanceof HttpError
        ? error
        : new HttpError(401, 'The access token is invalid or expired.'),
    );
  }
};

export function requirePermission(...requiredPermissions: string[]): RequestHandler {
  return (request, _response, next) => {
    const granted = request.auth?.permissions ?? [];
    if (requiredPermissions.every((permission) => granted.includes(permission))) {
      next();
      return;
    }
    next(new HttpError(403, 'You do not have permission to perform this action.'));
  };
}
