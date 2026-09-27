# Lifter ERP

A TypeScript monorepo containing a React operations console and an Express API backed by PostgreSQL and Prisma.

## Requirements

- Node.js 20 or newer and npm 10 or newer
- PostgreSQL 15 or Docker with Docker Compose

## Local development

1. Install dependencies from the repository root with `npm install`.
2. Run `npm run setup:env`. This creates `apps/api/.env`, `apps/web/.env`, and a root `.env` for Docker Compose, generates unique JWT/database/admin secrets, and never overwrites existing environment files.
3. To run everything with Docker, make sure Docker Desktop is running and execute `docker compose up --build -d`. Open http://localhost:8080; the API health endpoint is http://localhost:4000/api/health. The generated administrator email/password are in the root `.env`.
4. To run the apps from local Node processes using Compose PostgreSQL, run `docker compose up -d db`; PostgreSQL is bound to loopback port 5433. Then run `npm run db:generate`, `npm run db:migrate`, and `npm run db:seed` from the repository root, followed by `npm run dev`. The seed command loads `apps/api/.env` automatically. On a fresh database, its admin password is in `apps/api/.env`; if Compose initialized the database first, use the existing admin password from the root `.env` because reseeding preserves it.
5. For a separately installed PostgreSQL server, open `apps/api/.env` in VS Code or with `notepad apps/api/.env`, set `DATABASE_URL` to that server's credentials, then run the migration/seed commands.
6. Vite prints the frontend URL (normally http://localhost:5173); the API health endpoint is http://localhost:4000/api/health.

The equivalent manual PowerShell file-copy commands are `Copy-Item apps/api/.env.example apps/api/.env` and `Copy-Item apps/web/.env.example apps/web/.env`. To open a file, use `notepad apps/api/.env` or open it in VS Code; do not type `apps/api/.env` by itself at the PowerShell prompt. If files already exist, edit them instead of copying over them. Generated `.env` files contain credentials and must never be committed or shared.

## Browse database tables

The Compose stack includes Adminer, bound only to this computer. Open http://localhost:8081 and sign in with system `PostgreSQL`, server `db`, database `lifter_erp`, username `lifter`, and the `POSTGRES_PASSWORD` value from the root `.env` (open it with `notepad .env`). Select a table from the left to browse its rows, or use the SQL command page for read-only queries. Avoid editing database records directly; use the ERP API so validation, tenant scoping, and audit logs remain in effect.

The API applies Prisma migrations using `db:migrate` in development. `db:deploy` is intended for deployed environments. The seed command is safe to rerun and preserves the existing administrator password; use the password-reset flow to change it.

Database Access Guide

Ye guide first-time user ke liye hai. Isse PostgreSQL database ko Adminer ke through browser me open karke tables/data dekha ja sakta hai.

Step 1 — Project Folder Open Karo

PowerShell me project folder me jao:

cd "C:\Users\jayp1\OneDrive\Desktop\LIFTER INDUSTRIES WORKSPACE\LIFTER-INDUSTRIES-WORKSPACE"

Step 2 — .env File Setup Karo

Agar root folder me .env nahi hai:

Copy-Item .\apps\api\.env .\.env

Step 3 — Database Start Karo
docker compose up -d db database-ui

Step 4 — Check Karo
docker compose ps


db aur database-ui ke saamne Up dikhna chahiye.

Step 5 — Database Open Karo

Browser me ye address open karo:

http://localhost:8081


Adminer login screen par ye details enter karo:

System:   PostgreSQL
Server:   db
Username: lifter
Password: -g_JhXqoIQulGsxOLO3xjmY4p2RbXiFw
Database: lifter_erp

Important

Adminer ke Server field me:

db


likhna hai.

localhost, localhost:5433 ya 127.0.0.1 mat likhna.

Step 6 — Data Dekho

Login ke baad left side me database/tables dikhengi.

Wahan se tables open karke companies, users, roles aur doosra database data dekh sakte ho.

Quick Commands

Future me database dobara open karna ho to normally sirf:

cd "C:\Users\jayp1\OneDrive\Desktop\LIFTER INDUSTRIES WORKSPACE\LIFTER-INDUSTRIES-WORKSPACE"
docker compose up -d db database-ui
docker compose ps


Phir browser me:

http://localhost:8081

Database Credentials
System:   PostgreSQL
Server:   db
Username: lifter
Password: -g_JhXqoIQulGsxOLO3xjmY4p2RbXiFw
Database: lifter_erp

## Company and user management

Company, user, and role endpoints are mounted at `/api/companies`, `/api/users`, and `/api/roles`. Requests require a bearer access token. The API selects the active tenant from `X-Company-Id` only after confirming the signed-in user has a `UserCompanyRole` assignment in that company. The default context is the user's home company. Role grants are stored as company-owned module/action permissions and checked on every protected operation.

Company endpoints support CRUD, activation, and backup/restore. User endpoints support filtered pagination, profile/role changes, deactivation, password resets, and per-user activity history. Role endpoints include a permission catalog and reject grants the acting user does not hold. Create/update/deactivate/role changes and backup operations are written to `ActivityLog` transactionally.

Company backups are checksummed logical snapshots stored in the same PostgreSQL database. They contain company configuration, role grants, and user-to-role assignments; they deliberately exclude password credentials. They are useful for restoring tenant configuration, but are not physical database dumps or offsite disaster-recovery backups. Use PostgreSQL's backup tooling and independent storage for disaster recovery.

The company wizard validates Indian GSTIN, PAN, PIN code, and phone formats. User creation validates email and Indian mobile formats. User and role lists are paginated/scoped to the active company; the frontend sends the selected company context on every API request.

## Docker Compose

`npm run setup:env` creates the root Compose `.env` with random local credentials. Then run `docker compose up --build -d`. Compose waits for PostgreSQL, applies migrations, seeds the administrator, and then starts the API. The web app is available at http://localhost:8080 and the API health endpoint at http://localhost:4000/api/health. Read the generated admin email/password from the root `.env` when signing in.

## Vercel deployment

Create a Vercel project with this repository as its root. Use `npm ci` as the install command, `npm run build` as the build command, and `apps/web/dist` as the output directory. The build generates Prisma Client and builds both workspaces. `api/[...path].ts` exposes the existing Express routes as a Vercel Function; Vercel serves the React app for other paths. Do not configure a separate start command.

Add these Vercel environment variables for each environment where the app will run:

- `DATABASE_URL`: the hosted PostgreSQL provider's pooled/connection-pool URL for serverless API requests. It must not use the Docker hostname `db`.
- `DIRECT_URL`: the same database's direct, non-pooled connection URL for Prisma migrations. This also must not use `db:5432`.
- `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET`: different random secrets of at least 32 characters.
- `COOKIE_SECURE=true`.
- `CORS_ORIGIN`: comma-separated production/custom frontend origins if using a custom domain. Vercel deployment and production project URLs are also allowed automatically.
- `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`: set these when initializing/seeding the database; use a strong password of at least 12 characters.

Leave `VITE_API_URL` unset or set it to `/api` so the frontend calls the same-origin Vercel Function. `apps/web/vite.config.ts` continues to proxy `/api` to `http://localhost:4000` during `npm run dev`.

Run `npm run db:deploy` from a trusted machine or CI job with the Vercel database environment variables available before deploying schema changes. For a new database, run `npm run db:seed --workspace @lifter-erp/api` once after migrations. Migrations and seeding use `DIRECT_URL`; seeding falls back to `DATABASE_URL` when only one connection string is configured. Seeding is not part of the Vercel build or function startup, so deployments do not unexpectedly modify production data. Keep the pooled URL for application traffic. For providers without a pooler, both URL variables can use the same hosted PostgreSQL connection string.

## Workspace commands

- `npm run build`: build API and frontend
- `npm run typecheck`: type-check both workspaces
- `npm run setup:env`: create local environment files without overwriting existing files
- `npm run lint`: lint TypeScript and TSX sources
- `npm run format:check`: verify formatting
- `npm test`: run API validation tests
- `npm run db:generate`: generate the Prisma client
- `npm run db:migrate`: create/apply a development migration
- `npm run db:deploy`: apply committed migrations
- `npm run db:seed`: create the configured initial company and administrator

Refresh tokens are signed JWTs, stored as SHA-256 hashes in PostgreSQL, rotated on use, and sent only in an HTTP-only cookie. Access tokens are short-lived and held in frontend memory. Use HTTPS and set `COOKIE_SECURE=true` outside local development.
