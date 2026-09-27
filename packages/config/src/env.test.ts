import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { parseServerEnv } from "./env.js";

const validEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "runtime-database-configuration",
  DIRECT_URL: "migration-database-configuration",
  JWT_ACCESS_SECRET: randomBytes(32).toString("hex"),
  JWT_REFRESH_SECRET: randomBytes(32).toString("hex"),
};

describe("parseServerEnv", () => {
  it("parses required values and defaults", () => {
    const env = parseServerEnv(validEnv);
    expect(env.NODE_ENV).toBe("test");
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.JWT_ACCESS_EXPIRES_IN).toBe("15m");
  });

  it("reports missing required variables by name", () => {
    expect(() => parseServerEnv({})).toThrow("DATABASE_URL: DATABASE_URL is required");
    expect(() => parseServerEnv({})).toThrow("JWT_ACCESS_SECRET");
  });

  it("rejects insecure production cookie and CORS settings", () => {
    expect(() => parseServerEnv({ ...validEnv, NODE_ENV: "production" })).toThrow(
      "CORS_ORIGINS is required in production",
    );
  });

  it("rejects filesystem storage in production", () => {
    expect(() =>
      parseServerEnv({
        ...validEnv,
        NODE_ENV: "production",
        CORS_ORIGINS: "test-origin",
        COOKIE_SECURE: "true",
      }),
    ).toThrow("Local storage is not available in production");
  });
});
