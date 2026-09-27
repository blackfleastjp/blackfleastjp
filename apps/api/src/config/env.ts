import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: z.preprocess((value) => value === 'true', z.boolean()).default(false),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);
if (!parsedEnvironment.success) {
  console.error(
    'Invalid environment configuration:',
    parsedEnvironment.error.flatten().fieldErrors,
  );
  throw new Error('The API environment is invalid. Check apps/api/.env.example.');
}

export const env = parsedEnvironment.data;
