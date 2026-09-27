import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { createFailure } from "@erp/shared";
import { logger } from "../lib/logger.js";
import { AppError } from "../lib/errors.js";

export const notFound: RequestHandler = (request, _response, next) => {
  next(new AppError(404, "NOT_FOUND", `No route matches ${request.method} ${request.path}`));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  let statusCode = 500;
  let code = "INTERNAL_ERROR";
  let message = "An unexpected error occurred";
  let details: unknown;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Request validation failed";
    details = error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
  } else if (typeof error === "object" && error !== null && "type" in error) {
    if (error.type === "entity.too.large") {
      statusCode = 413;
      code = "BODY_TOO_LARGE";
      message = "Request body exceeds the 1 MB limit";
    } else if (error.type === "entity.parse.failed") {
      statusCode = 400;
      code = "INVALID_JSON";
      message = "Request body must contain valid JSON";
    }
  }

  if (statusCode >= 500)
    logger.error({ err: error, requestId: request.requestId }, "API request failed");
  response.status(statusCode).json(createFailure(code, message, request.requestId, details));
};
