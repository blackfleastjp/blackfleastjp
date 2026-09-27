import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { requireActiveCompany } from '../middleware/company-context';
import { validateBody } from '../middleware/validate';
import {
  companyStatusSchema,
  createBackupSchema,
  createCompanySchema,
  restoreCompanySchema,
  updateCompanySchema,
} from './company.schema';
import {
  createCompanyBackupHandler,
  createCompanyHandler,
  deactivateCompanyHandler,
  getCompanyHandler,
  listCompaniesHandler,
  restoreCompanyBackupHandler,
  setCompanyActiveHandler,
  updateCompanyHandler,
} from './company.controller';

export const companyRouter = Router();
companyRouter.use(authenticate);

companyRouter.get('/', requirePermission('companies:read'), listCompaniesHandler);
companyRouter.post(
  '/',
  requirePermission('companies:create'),
  requireActiveCompany,
  validateBody(createCompanySchema),
  createCompanyHandler,
);
companyRouter.get('/:id', requirePermission('companies:read'), getCompanyHandler);
companyRouter.put(
  '/:id',
  requirePermission('companies:update'),
  requireActiveCompany,
  validateBody(updateCompanySchema),
  updateCompanyHandler,
);
companyRouter.delete(
  '/:id',
  requirePermission('companies:delete'),
  requireActiveCompany,
  deactivateCompanyHandler,
);
companyRouter.post(
  '/:id/activate',
  requirePermission('companies:activate'),
  validateBody(companyStatusSchema),
  setCompanyActiveHandler,
);
companyRouter.post(
  '/:id/backup',
  requirePermission('companies:backup'),
  requireActiveCompany,
  validateBody(createBackupSchema),
  createCompanyBackupHandler,
);
companyRouter.post(
  '/:id/restore',
  requirePermission('companies:restore'),
  validateBody(restoreCompanySchema),
  restoreCompanyBackupHandler,
);
