import type { RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../lib/env.js";
import { AppError, unauthorized } from "../lib/errors.js";

interface AccessClaims extends JwtPayload {
  sub: string;
  email: string;
  type: "access";
}

export const authenticate: RequestHandler = (request, _response, next) => {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return next(unauthorized());
  try {
    const claims = jwt.verify(authorization.slice(7), env.JWT_ACCESS_SECRET) as AccessClaims;
    if (claims.type !== "access" || !claims.sub || !claims.email)
      return next(unauthorized("Invalid access token"));
    request.auth = { userId: claims.sub, email: claims.email };
    next();
  } catch {
    next(unauthorized("Invalid or expired access token"));
  }
};

export function requirePermission(permission: string): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth?.companyId) return next(unauthorized("Company context is required"));
    if (!request.auth.permissions?.has(permission)) {
      return next(
        new AppError(403, "PERMISSION_DENIED", "You do not have permission to perform this action"),
      );
    }
    next();
  };
}

export const authenticateOptional: RequestHandler = (request, _response, next) => {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    try {
      const claims = jwt.verify(authorization.slice(7), env.JWT_ACCESS_SECRET) as AccessClaims;
      if (claims.type === "access" && claims.sub && claims.email)
        request.auth = { userId: claims.sub, email: claims.email };
    } catch {
      delete request.auth;
    }
  }
  next();
};
