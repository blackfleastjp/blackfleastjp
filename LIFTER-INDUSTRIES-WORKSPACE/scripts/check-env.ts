import "dotenv/config";
import { parseServerEnv } from "@erp/config";

try {
  const configuration = parseServerEnv();
  console.info(`Environment configuration is valid for ${configuration.APP_ENV}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Environment validation failed.");
  process.exitCode = 1;
}
