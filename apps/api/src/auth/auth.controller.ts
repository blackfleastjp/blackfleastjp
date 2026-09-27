import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { asyncHandler } from '../utils/async-handler';
import { HttpError } from '../utils/http-error';
import { getAuthenticatedUser, login, logout, refresh } from './auth.service';

export const refreshCookieName = 'lifter_refresh';
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'strict' as const,
  path: '/api/auth',
};

function setRefreshCookie(response: Parameters<RequestHandler>[1], token: string): void {
  response.cookie(refreshCookieName, token, {
    ...refreshCookieOptions,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export const loginHandler = asyncHandler(async (request, response) => {
  const result = await login(request.body.email as string, request.body.password as string);
  setRefreshCookie(response, result.refreshToken);
  response.json({ accessToken: result.accessToken, user: result.user });
});

export const refreshHandler = asyncHandler(async (request, response) => {
  const token = request.cookies[refreshCookieName] as string | undefined;
  if (!token) {
    response.status(204).end();
    return;
  }
  const result = await refresh(token);
  setRefreshCookie(response, result.refreshToken);
  response.json({ accessToken: result.accessToken, user: result.user });
});

export const logoutHandler = asyncHandler(async (request, response) => {
  await logout(request.cookies[refreshCookieName] as string | undefined);
  response.clearCookie(refreshCookieName, refreshCookieOptions);
  response.status(204).end();
});

export const currentUserHandler = asyncHandler(async (request, response) => {
  if (!request.auth) throw new HttpError(401, 'Authentication is required.');
  response.json({ user: await getAuthenticatedUser(request.auth.userId) });
});
