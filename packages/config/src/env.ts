import { z } from "zod";

const booleanFromString = z.preprocess((value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return value;
}, z.boolean());

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.string().default("development"),
    DATABASE_URL: z
      .string({ error: "DATABASE_URL is required" })
      .min(1, "DATABASE_URL is required"),
    DIRECT_URL: z.string({ error: "DIRECT_URL is required" }).min(1, "DIRECT_URL is required"),
    JWT_ACCESS_SECRET: z
      .string({ error: "JWT_ACCESS_SECRET is required" })
      .min(32, "JWT_ACCESS_SECRET must contain at least 32 characters"),
    JWT_REFRESH_SECRET: z
      .string({ error: "JWT_REFRESH_SECRET is required" })
      .min(32, "JWT_REFRESH_SECRET must contain at least 32 characters"),
    JWT_ACCESS_EXPIRES_IN: z
      .string()
      .regex(/^\d+[smhd]$/, "Use a duration such as 15m or 30d")
      .default("15m"),
    JWT_REFRESH_EXPIRES_IN: z
      .string()
      .regex(/^\d+[smhd]$/, "Use a duration such as 15m or 30d")
      .default("30d"),
    COOKIE_DOMAIN: z.string().optional().default(""),
    COOKIE_SECURE: booleanFromString.default(false),
    COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),
    CORS_ORIGINS: z.string().optional().default(""),
    APP_URL: z.string().optional().default(""),
    STORAGE_PROVIDER: z.enum(["local", "s3", "vercel-blob"]).default("local"),
    STORAGE_BUCKET: z.string().optional().default(""),
    STORAGE_REGION: z.string().optional().default(""),
    STORAGE_ENDPOINT: z.string().optional().default(""),
    STORAGE_ACCESS_KEY: z.string().optional().default(""),
    STORAGE_SECRET_KEY: z.string().optional().default(""),
    EMAIL_PROVIDER: z.string().optional().default(""),
    EMAIL_FROM: z.string().optional().default(""),
    EMAIL_API_KEY: z.string().optional().default(""),
    GST_API_BASE_URL: z.string().optional().default(""),
    GST_API_USERNAME: z.string().optional().default(""),
    GST_API_PASSWORD: z.string().optional().default(""),
    GST_API_CLIENT_ID: z.string().optional().default(""),
    GST_API_CLIENT_SECRET: z.string().optional().default(""),
    EINVOICE_ENVIRONMENT: z.string().optional().default(""),
    EWAYBILL_ENVIRONMENT: z.string().optional().default(""),
    SENTRY_DSN: z.string().optional().default(""),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === "production" && !env.CORS_ORIGINS.trim()) {
      context.addIssue({
        code: "custom",
        path: ["CORS_ORIGINS"],
        message: "CORS_ORIGINS is required in production",
      });
    }
    if (env.NODE_ENV === "production" && !env.COOKIE_SECURE) {
      context.addIssue({
        code: "custom",
        path: ["COOKIE_SECURE"],
        message: "COOKIE_SECURE must be true in production",
      });
    }
    if (env.NODE_ENV === "production" && env.STORAGE_PROVIDER === "local") {
      context.addIssue({
        code: "custom",
        path: ["STORAGE_PROVIDER"],
        message: "Local storage is not available in production",
      });
    }
    if (env.COOKIE_SAME_SITE === "none" && !env.COOKIE_SECURE) {
      context.addIssue({
        code: "custom",
        path: ["COOKIE_SAME_SITE"],
        message: "SameSite=None requires secure cookies",
      });
    }
    if (
      env.STORAGE_PROVIDER === "s3" &&
      (!env.STORAGE_BUCKET ||
        !env.STORAGE_REGION ||
        !env.STORAGE_ACCESS_KEY ||
        !env.STORAGE_SECRET_KEY)
    ) {
      context.addIssue({
        code: "custom",
        path: ["STORAGE_BUCKET"],
        message: "S3 storage requires bucket, region, access key, and secret key",
      });
    }
    if (env.STORAGE_PROVIDER === "vercel-blob" && !env.STORAGE_ACCESS_KEY) {
      context.addIssue({
        code: "custom",
        path: ["STORAGE_ACCESS_KEY"],
        message: "Vercel Blob storage requires a read/write token",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid server environment configuration:\n- ${issues.join("\n- ")}`);
  }
  return result.data;
}
