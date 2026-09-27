import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { parseServerEnv } from "@erp/config";

loadEnv({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });

export const env = parseServerEnv();
export const corsOrigins = new Set(
  env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
