import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { requireActiveCompany } from '../middleware/company-context';
import { validateBody } from '../middleware/validate';
import { createUserSchema, resetPasswordSchema, updateUserSchema } from './user.schema';
import {
  createUserHandler,
  deactivateUserHandler,
  getUserHandler,
  listUsersHandler,
  resetUserPasswordHandler,
  updateUserHandler,
  userActivityHandler,
} from './user.controller';

export const userRouter = Router();
userRouter.use(authenticate, requireActiveCompany);

userRouter.get('/', requirePermission('users:read'), listUsersHandler);
userRouter.post(
  '/',
  requirePermission('users:create'),
  validateBody(createUserSchema),
  createUserHandler,
);
userRouter.get('/:id', requirePermission('users:read'), getUserHandler);
userRouter.put(
  '/:id',
  requirePermission('users:update'),
  validateBody(updateUserSchema),
  updateUserHandler,
);
userRouter.delete('/:id', requirePermission('users:delete'), deactivateUserHandler);
userRouter.post(
  '/:id/reset-password',
  requirePermission('users:reset-password'),
  validateBody(resetPasswordSchema),
  resetUserPasswordHandler,
);
userRouter.get('/:id/activity-log', requirePermission('users:activity-log'), userActivityHandler);
