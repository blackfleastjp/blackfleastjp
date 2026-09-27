/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `companies` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[gstin]` on the table `companies` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[pan]` on the table `companies` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[module,action]` on the table `permissions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,employee_code]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "BackgroundJobType" AS ENUM ('COMPANY_BACKUP', 'COMPANY_RESTORE');

-- CreateEnum
CREATE TYPE "BackgroundJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "module" VARCHAR(80),
ADD COLUMN     "new_value" JSONB,
ADD COLUMN     "old_value" JSONB,
ADD COLUMN     "user_agent" VARCHAR(500);

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "address" VARCHAR(500),
ADD COLUMN     "base_currency" CHAR(3) NOT NULL DEFAULT 'INR',
ADD COLUMN     "books_beginning_date" DATE,
ADD COLUMN     "city" VARCHAR(120),
ADD COLUMN     "code" VARCHAR(32),
ADD COLUMN     "country" CHAR(2) NOT NULL DEFAULT 'IN',
ADD COLUMN     "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN     "email" VARCHAR(320),
ADD COLUMN     "feature_configuration" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "financial_year_end" DATE,
ADD COLUMN     "financial_year_start" DATE,
ADD COLUMN     "gstin" CHAR(15),
ADD COLUMN     "logo" VARCHAR(2048),
ADD COLUMN     "pan" CHAR(10),
ADD COLUMN     "phone" VARCHAR(20),
ADD COLUMN     "pincode" VARCHAR(10),
ADD COLUMN     "state" VARCHAR(120),
ALTER COLUMN "currency" SET DEFAULT 'INR',
ALTER COLUMN "timezone" SET DEFAULT 'Asia/Kolkata';

-- Preserve existing tenants while establishing the required unique company code.
UPDATE "companies"
SET "code" = 'LEGACY-' || LPAD("company_codes"."sequence"::text, 25, '0')
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS "sequence"
  FROM "companies"
  WHERE "code" IS NULL
) AS "company_codes"
WHERE "companies"."id" = "company_codes"."id";

ALTER TABLE "companies" ALTER COLUMN "code" SET NOT NULL;

-- AlterTable
ALTER TABLE "permissions" ADD COLUMN     "action" VARCHAR(80),
ADD COLUMN     "module" VARCHAR(80),
ADD COLUMN     "name" VARCHAR(120),
ADD COLUMN     "updated_at" TIMESTAMPTZ(3);

-- Existing permission keys are the source of truth for module/action metadata.
UPDATE "permissions"
SET "module" = COALESCE(NULLIF(SPLIT_PART("key", '.', 1), ''), 'legacy'),
    "action" = COALESCE(NULLIF(SUBSTRING("key" FROM POSITION('.' IN "key") + 1), ''), 'manage'),
    "name" = INITCAP(REPLACE("key", '.', ' ')),
    "updated_at" = COALESCE("created_at", CURRENT_TIMESTAMP);

ALTER TABLE "permissions" ALTER COLUMN "module" SET NOT NULL,
ALTER COLUMN "action" SET NOT NULL,
ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "user_company_roles" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "alternate_email" VARCHAR(320),
ADD COLUMN     "company_id" TEXT,
ADD COLUMN     "date_of_joining" DATE,
ADD COLUMN     "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN     "department" VARCHAR(120),
ADD COLUMN     "designation" VARCHAR(120),
ADD COLUMN     "employee_code" VARCHAR(80),
ADD COLUMN     "last_login_at" TIMESTAMPTZ(3),
ADD COLUMN     "mobile" VARCHAR(20);

-- Preserve the Phase 0 primary-company association used by company-scoped user lists.
UPDATE "users" AS "user"
SET "company_id" = (
    SELECT "membership"."company_id"
    FROM "user_company_roles" AS "membership"
    WHERE "membership"."user_id" = "user"."id"
    ORDER BY "membership"."created_at", "membership"."company_id"
    LIMIT 1
)
WHERE "user"."company_id" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "user_company_roles" AS "membership"
    WHERE "membership"."user_id" = "user"."id"
  );

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "type" "BackgroundJobType" NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "error" VARCHAR(1000),
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_expires_at_idx" ON "password_reset_tokens"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "password_reset_tokens_used_at_expires_at_idx" ON "password_reset_tokens"("used_at", "expires_at");

-- CreateIndex
CREATE INDEX "background_jobs_company_id_status_created_at_idx" ON "background_jobs"("company_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "background_jobs_status_created_at_idx" ON "background_jobs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "companies_gstin_key" ON "companies"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "companies_pan_key" ON "companies"("pan");

-- CreateIndex
CREATE INDEX "companies_deleted_at_is_active_idx" ON "companies"("deleted_at", "is_active");

-- CreateIndex
CREATE INDEX "permissions_module_action_idx" ON "permissions"("module", "action");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_module_action_key" ON "permissions"("module", "action");

-- CreateIndex
CREATE INDEX "users_company_id_is_active_name_idx" ON "users"("company_id", "is_active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_company_id_employee_code_key" ON "users"("company_id", "employee_code");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
