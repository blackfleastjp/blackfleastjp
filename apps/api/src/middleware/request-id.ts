import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const requestIdMiddleware: RequestHandler = (request, response, next) => {
  request.requestId = randomUUID();
  response.setHeader("X-Request-ID", request.requestId);
  next();
};
