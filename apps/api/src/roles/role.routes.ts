import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { requireActiveCompany } from '../middleware/company-context';
import { validateBody } from '../middleware/validate';
import { assignPermissionsSchema, createRoleSchema, updateRoleSchema } from './role.schema';
import {
  assignRolePermissionsHandler,
  createRoleHandler,
  deleteRoleHandler,
  listRolesHandler,
  permissionCatalogHandler,
  updateRoleHandler,
} from './role.controller';

export const roleRouter = Router();
roleRouter.use(authenticate, requireActiveCompany);

roleRouter.get('/', requirePermission('roles:read'), listRolesHandler);
roleRouter.get('/permission-catalog', requirePermission('roles:read'), permissionCatalogHandler);
roleRouter.post(
  '/',
  requirePermission('roles:create'),
  validateBody(createRoleSchema),
  createRoleHandler,
);
roleRouter.put(
  '/:id',
  requirePermission('roles:update'),
  validateBody(updateRoleSchema),
  updateRoleHandler,
);
roleRouter.delete('/:id', requirePermission('roles:delete'), deleteRoleHandler);
roleRouter.post(
  '/:id/assign-permissions',
  requirePermission('roles:assign-permissions'),
  validateBody(assignPermissionsSchema),
  assignRolePermissionsHandler,
);
