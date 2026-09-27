import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../utils/async-handler';
import {
  currentUserHandler,
  loginHandler,
  logoutHandler,
  refreshHandler,
} from '../auth/auth.controller';
import { loginSchema } from '../auth/auth.schema';
import { prisma } from '../db/prisma';

export const authRouter = Router();

authRouter.post('/login', validateBody(loginSchema), loginHandler);
authRouter.post('/refresh', refreshHandler);
authRouter.post('/logout', logoutHandler);
authRouter.get('/me', authenticate, currentUserHandler);

export const healthRouter = Router();
healthRouter.get(
  '/',
  asyncHandler(async (_request, response) => {
    await prisma.$queryRaw`SELECT 1`;
    response.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  }),
);
