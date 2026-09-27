import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { authRouter, healthRouter } from './routes/auth.routes';
import { companyRouter } from './companies/company.routes';
import { userRouter } from './users/user.routes';
import { roleRouter } from './roles/role.routes';

export const app = express();
const allowedOrigins = new Set(
  [
    ...env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    ...[process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
      .filter((origin): origin is string => Boolean(origin))
      .map((origin) => `https://${origin}`),
  ].filter(Boolean),
);

app.disable('x-powered-by');
if (env.NODE_ENV === 'production') app.set('trust proxy', 1);
// Cookie credentials require an explicit origin allowlist; wildcard origins are intentionally rejected.
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed by CORS.'));
    },
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/companies', companyRouter);
app.use('/api/users', userRouter);
app.use('/api/roles', roleRouter);
app.use(notFoundHandler);
app.use(errorHandler);
