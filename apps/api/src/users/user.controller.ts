import type { Request } from 'express';
import { HttpError } from '../utils/http-error';
import { asyncHandler } from '../utils/async-handler';
import {
  createUser,
  deactivateUser,
  getUser,
  getUserActivity,
  listUsers,
  resetUserPassword,
  updateUser,
} from './user.service';
import { userListQuerySchema } from './user.schema';

function routeUserId(request: Request): string {
  const userId = request.params.id;
  if (typeof userId !== 'string') throw new HttpError(400, 'A valid user ID is required.');
  return userId;
}

export const listUsersHandler = asyncHandler(async (request, response) => {
  const query = userListQuerySchema.parse(request.query);
  response.json(await listUsers(request, query));
});

export const getUserHandler = asyncHandler(async (request, response) => {
  response.json({ user: await getUser(request, routeUserId(request)) });
});

export const createUserHandler = asyncHandler(async (request, response) => {
  response.status(201).json({ user: await createUser(request, request.body) });
});

export const updateUserHandler = asyncHandler(async (request, response) => {
  response.json({ user: await updateUser(request, routeUserId(request), request.body) });
});

export const deactivateUserHandler = asyncHandler(async (request, response) => {
  response.json({ user: await deactivateUser(request, routeUserId(request)) });
});

export const resetUserPasswordHandler = asyncHandler(async (request, response) => {
  await resetUserPassword(request, routeUserId(request), request.body.password as string);
  response.json({ message: 'The password was reset and all existing sessions were revoked.' });
});

export const userActivityHandler = asyncHandler(async (request, response) => {
  const { page, pageSize } = userListQuerySchema
    .pick({ page: true, pageSize: true })
    .parse(request.query);
  response.json(await getUserActivity(request, routeUserId(request), page, pageSize));
});
