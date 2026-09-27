import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { createFailure, createSuccess } from "@erp/shared";
import { AppError } from "../lib/errors.js";
import { env } from "../lib/env.js";
import { processNextBackgroundJob } from "../lib/background-jobs.js";

export const jobsRouter = Router();

async function processOneJob(request: import("express").Request, response: import("express").Response) {
  if (!env.JOB_PROCESSOR_SECRET) {
    throw new AppError(503, "JOB_PROCESSOR_DISABLED", "Background job processing is not configured");
  }
  const authorization = request.header("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expected = Buffer.from(env.JOB_PROCESSOR_SECRET);
  const received = Buffer.from(token);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new AppError(401, "JOB_PROCESSOR_UNAUTHORIZED", "Job processor credentials are invalid");
  }
  const job = await processNextBackgroundJob();
  response.json(createSuccess({ processed: job !== null, job }, "Background job poll completed", request.requestId));
}

jobsRouter.get("/process", processOneJob);
jobsRouter.post("/process", processOneJob);

jobsRouter.use((error: unknown, request: import("express").Request, response: import("express").Response, next: import("express").NextFunction) => {
  if (error instanceof AppError) {
    response.status(error.statusCode).json(createFailure(error.code, error.message, request.requestId));
    return;
  }
  next(error);
});