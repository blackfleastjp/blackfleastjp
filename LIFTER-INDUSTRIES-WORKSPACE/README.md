# Ledgerline ERP

Ledgerline is a TypeScript monorepo for a responsive, multi-company ERP foundation. It includes a React client, a Vercel-compatible Express API, PostgreSQL/Prisma persistence, company-scoped authorization, rotating cookie-backed sessions, audit logging, and shared validation/types.

## Requirements

- Node.js 24 (see `.nvmrc`) and npm 11 or compatible
- Docker Desktop, or a PostgreSQL 16 instance
- A PostgreSQL connection string available to the application as `DATABASE_URL` and to Prisma migrations as `DIRECT_URL`

## Local Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and fill in the database connection, two independent random JWT secrets (at least 32 characters each), and the local PostgreSQL variables. Keep `.env` out of version control.
3. Verify the server configuration with `npm run env:check`.
4. Start PostgreSQL with `docker compose up -d postgres` after setting `POSTGRES_DB`, `POSTGRES_USER`, and a strong `POSTGRES_PASSWORD` in `.env`.
5. Generate the Prisma client and apply migrations with `npm run prisma:generate` and `npm run prisma:migrate:dev`.
6. Load permission catalog records with `npm run prisma:seed`.
7. Start the API and web app with `npm run dev`. The API listens on the `PORT` supplied by the host (3001 locally); set `API_BASE_URL` in `.env` to the API origin so Vite can proxy `/api`. The web app uses `/api` on the same origin unless `VITE_API_URL` is configured for a separate deployment.
8. Open the Vite address printed by the web development server and create the first company administrator from the registration screen.

The API fails at startup with a list of missing or invalid required environment values. Local `STORAGE_PROVIDER=local` writes files under the ignored `storage/` directory. Never use that provider in production.

## Environment

`.env.example` lists runtime, migration, browser, authentication, cookie, CORS, object storage, email, tax integration, monitoring, and logging configuration. Server values are parsed by the Zod schema in `packages/config/src/env.ts`; secrets are never shipped to the browser. The Vite client only reads `VITE_API_URL`.

Use different access and refresh secrets in every environment. Generate secrets locally with a cryptographically secure random generator; do not use the test setup values as production secrets. For same-domain deployments, leave `VITE_API_URL` unset so the browser uses relative `/api` requests. For separate deployments, set it to the API base URL and configure the API's `CORS_ORIGINS` with the exact frontend origins.

## PostgreSQL and Prisma

The compose file starts PostgreSQL 16 and reads its database name, user, and password from the environment. `DATABASE_URL` is the runtime connection and `DIRECT_URL` is the direct migration connection; point both at the appropriate PostgreSQL service for local development. Production deployments should use a pooled runtime URL where applicable and a direct database URL for migrations.

```sh
npm run prisma:generate
npm run prisma:validate
npm run prisma:format
npm run prisma:migrate:dev
npm run prisma:seed
npm run prisma:migrate:deploy
```

The Prisma schema uses relational constraints and Decimal-ready PostgreSQL storage conventions. No financial amount calculations are currently exposed by the foundation API. Database access is centralized through a hot-reload-safe Prisma singleton.

## Development Checks

```sh
npm run format:check
npm run lint
npm run typecheck
npm run prisma:validate
npm run env:check
npm run test
npm run test:e2e
npm run build
```

Browser tests require Chromium and `PLAYWRIGHT_BASE_URL` pointing to a running web app. Install the browser with `npx playwright install chromium`. API tests use a mocked Prisma boundary; readiness behavior is checked without requiring a running database, while `GET /api/ready` checks the real connection at runtime.

The GitHub Actions workflow installs dependencies, checks formatting/lint/types, generates and validates Prisma, runs API/environment tests and Playwright smoke tests, builds both apps, and runs Gitleaks secret scanning. It provides a temporary PostgreSQL service for schema validation.

## API

- `GET /api/health` reports process liveness.
- `GET /api/ready` executes a PostgreSQL query before reporting readiness.
- `POST /api/auth/register` creates a company administrator and initial company.
- `POST /api/auth/login`, `POST /api/auth/refresh`, and `POST /api/auth/logout` manage sessions.
- `GET /api/auth/me` returns the authenticated account and accessible companies.
- `GET /api/companies` provides the caller's paginated company list.
- `/api/companies` supports create/list/detail/update/soft-delete/activate, feature configuration, and queued backup/restore jobs. Company detail and mutation routes require the selected `X-Company-Id` to match the route ID.
- `/api/users` supports filtered/paginated list, create/detail/update/soft-delete, transactional role assignment, admin reset-password, and per-user activity history.
- `/api/roles` supports company-scoped role CRUD, active/inactive filters, and transactional permission-matrix assignment. `GET /api/permissions` returns the module/action catalog.
- `GET /api/jobs/process` is the Vercel Cron worker endpoint. It requires `Authorization: Bearer <JOB_PROCESSOR_SECRET>` and claims at most one queued backup/restore job per invocation.
- `POST /api/auth/change-password`, `/forgot-password`, and `/reset-password` implement authenticated password changes and expiring, hashed, single-use recovery tokens.
- `GET /api/dashboard/summary`, `/api/dashboard/users`, and `/api/dashboard/activity` require a valid `X-Company-Id`, authenticated membership, and the relevant permission.

Access tokens are returned to the browser and held in memory only. Refresh tokens are hashed in PostgreSQL, rotated transactionally, and stored in an HttpOnly cookie. The browser client performs one shared refresh attempt after a protected request receives a 401, retries that request once, and redirects to sign-in if refresh fails. API responses include a request ID and use the shared success/error envelope.

Company IDs from the browser are treated only as context selectors; the API verifies membership and loads permissions for every company-scoped request. Pagination is capped at 100 rows, and list endpoints support bounded search.

The shared permission catalog is defined as `module.action` keys and seeded into PostgreSQL. Frontend navigation/routes hide pages the selected company role cannot access; the API independently verifies the same permissions. User-role and role-permission changes, profile/company changes, deactivation, login, reset-password, and permission updates are audited with before/after values where applicable. Companies and users are soft-deleted.

Password recovery requires a configured email provider in production: set `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_API_KEY`, `EMAIL_API_BASE_URL`, and `APP_URL`. `PASSWORD_RESET_EXPIRES_IN` controls token lifetime. Development without an email provider returns the one-time reset token in the API response for local testing; production responses never include it.

## Files and Reports

The directory can preview CSV and Excel workbooks with a 10 MB/1,000-row limit. It does not write imported records. The dashboard and directory can export PDF reports. API storage helpers support local development, S3-compatible object storage, and private Vercel Blob storage; production configuration rejects local filesystem storage. Backup/restore requests create database job records and return `202`. Vercel Cron invokes the bounded worker once per minute; each invocation atomically claims at most one job, encrypts backup snapshots with AES-256-GCM, and stores them through the configured object-storage provider. Restore jobs only accept completed backups from the same company. No backup file is persisted on the Vercel function filesystem.

## Vercel Deployment

1. Import the repository into Vercel with the repository root as the project root.
2. Configure a PostgreSQL provider and set `DATABASE_URL` and `DIRECT_URL` in the Vercel project. Apply migrations in the deployment pipeline with `npm run prisma:migrate:deploy`.
3. Set independent `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values, `COOKIE_SECURE=true`, an appropriate `COOKIE_SAME_SITE`, exact `CORS_ORIGINS` values, a random `JOB_PROCESSOR_SECRET` of at least 32 characters, and a separate `BACKUP_ENCRYPTION_KEY` containing 64 hexadecimal characters. Set Vercel's `CRON_SECRET` to the same value as `JOB_PROCESSOR_SECRET`. Production startup rejects missing CORS, insecure cookies, local storage, email delivery configuration, or backup encryption settings.
4. Configure production storage as `s3` or `vercel-blob`. S3 requires bucket, region, endpoint when using an S3-compatible service, and credentials. Vercel Blob uses `STORAGE_ACCESS_KEY` for its read/write token.
5. Set `APP_URL`, email/tax provider values required by enabled integrations, and observability configuration. Keep secrets in Vercel's encrypted environment settings.
6. Leave `VITE_API_URL` unset when the web and API share the Vercel domain. For separate projects, set it to the API base URL and allow the frontend origin in `CORS_ORIGINS`.
7. Add the same required server settings to Preview and Production scopes. Preview should use isolated database/storage resources and preview-specific secrets; production secrets must not be copied into preview.

`vercel.json` builds the Vite output and declares the catch-all serverless function. Vercel serves the API function route separately from the React SPA fallback; API requests are handled by `api/[...path].ts`, while client routes resolve to the web entry point.

## Troubleshooting

- **Environment validation fails:** compare `.env` with `.env.example`; ensure database URLs and independent JWT secrets are set, and enable secure cookies plus exact CORS origins for production.
- **Prisma cannot connect:** verify PostgreSQL health and credentials, then check that `DATABASE_URL` reaches the runtime service and `DIRECT_URL` reaches the migration service.
- **Browser requests fail locally:** set `API_BASE_URL` for the Vite proxy or set `VITE_API_URL` for a separate API. Ensure the API `CORS_ORIGINS` contains the exact frontend origin when using a separate origin.
- **Refresh cookie is not sent across origins:** use HTTPS, `COOKIE_SECURE=true`, a compatible SameSite policy, credentials-enabled CORS, and matching cookie domain configuration.
- **Vercel reports missing files after upload:** select an S3-compatible or Vercel Blob provider; serverless local files are ephemeral.
- **A user cannot view a company:** confirm an active `UserCompanyRole` membership and the required role permission in PostgreSQL.
- **Playwright cannot connect:** start the web development server and set `PLAYWRIGHT_BASE_URL` to its printed origin before invoking `npm run test:e2e`.
