import { randomBytes } from "node:crypto";

process.env.NODE_ENV ??= "test";
process.env.APP_ENV ??= "test";
process.env.DATABASE_URL ??= "runtime-database-configuration";
process.env.DIRECT_URL ??= "migration-database-configuration";
process.env.JWT_ACCESS_SECRET ??= randomBytes(32).toString("hex");
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString("hex");
process.env.JOB_PROCESSOR_SECRET ??= randomBytes(32).toString("hex");
