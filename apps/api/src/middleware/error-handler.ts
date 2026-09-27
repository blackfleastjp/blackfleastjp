import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { HttpError } from '../utils/http-error';

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new HttpError(404, `Route ${request.method} ${request.path} was not found.`));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  let statusCode = 500;
  let message = 'An unexpected error occurred.';
  let details: unknown;

  if (error instanceof HttpError) {
    statusCode = error.statusCode;
    message = error.message;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    message = 'Request validation failed.';
    details = error.flatten().fieldErrors;
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    statusCode = 409;
    message = 'A record with these details already exists.';
  }

  if (statusCode >= 500) console.error(error);
  response.status(statusCode).json({
    error: message,
    ...(details ? { details } : {}),
    ...(env.NODE_ENV !== 'production' && error instanceof Error
      ? { debugMessage: error.message }
      : {}),
  });
};
