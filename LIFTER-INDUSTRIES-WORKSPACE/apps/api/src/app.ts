import { createFailure } from "@erp/shared";
import { AppError } from "./lib/errors.js";
import { randomUUID } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { env, corsOrigins } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { authRouter } from "./routes/auth.js";
import { companiesRouter } from "./routes/companies.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { healthRouter } from "./routes/health.js";
import { usersRouter } from "./routes/users.js";
import { permissionsRouter, rolesRouter } from "./routes/roles.js";
import { jobsRouter } from "./routes/jobs.js";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(requestIdMiddleware);
app.use(pinoHttp({ logger, genReqId: (request) => request.requestId || randomUUID() }));
app.use(helmet());
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (
        !origin ||
        (env.NODE_ENV !== "production" && corsOrigins.size === 0) ||
        corsOrigins.has(origin)
      )
        return callback(null, true);
      callback(new AppError(403, "CORS_ORIGIN_DENIED", "Origin is not allowed by CORS"));
    },
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (request, response) =>
    response
      .status(429)
      .json(
        createFailure("RATE_LIMITED", "Too many attempts. Try again later.", request.requestId),
      ),
});

app.use("/api/auth/login", sensitiveLimiter);
app.use("/api/auth/register", sensitiveLimiter);
app.use("/api/auth/refresh", sensitiveLimiter);
app.use("/api/auth/logout", sensitiveLimiter);
app.use("/api/auth/forgot-password", sensitiveLimiter);
app.use("/api/auth/reset-password", sensitiveLimiter);
app.use("/api/users/:id/reset-password", sensitiveLimiter);
app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/users", usersRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/permissions", permissionsRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use(notFound);
app.use(errorHandler);
