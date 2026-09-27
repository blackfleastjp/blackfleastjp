import { Router } from "express";
import { createSuccess } from "@erp/shared";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

export const healthRouter = Router();

healthRouter.get("/health", (request, response) => {
  response.json(createSuccess({ status: "ok" }, "Service is healthy", request.requestId));
});

healthRouter.get("/ready", async (request, response, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    response.json(
      createSuccess(
        { status: "ready", database: "connected" },
        "Service is ready",
        request.requestId,
      ),
    );
  } catch {
    next(new AppError(503, "DATABASE_UNAVAILABLE", "Database is unavailable"));
  }
});
