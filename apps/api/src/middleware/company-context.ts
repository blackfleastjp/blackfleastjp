import type { RequestHandler } from 'express';
import { prisma } from '../db/prisma';
import { HttpError } from '../utils/http-error';

export const requireActiveCompany: RequestHandler = (request, _response, next) => {
  const companyId = request.auth?.companyId;
  if (!companyId) {
    next(new HttpError(401, 'Authentication is required.'));
    return;
  }

  void prisma.company
    .findUnique({ where: { id: companyId }, select: { isActive: true } })
    .then((company) => {
      if (!company) throw new HttpError(404, 'The selected company was not found.');
      if (!company.isActive) throw new HttpError(409, 'The selected company is inactive.');
      next();
    })
    .catch(next);
};
