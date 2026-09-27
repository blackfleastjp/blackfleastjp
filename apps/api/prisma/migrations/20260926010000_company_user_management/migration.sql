ALTER TABLE "Company"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "pincode" TEXT,
  ADD COLUMN "country" TEXT NOT NULL DEFAULT 'India',
  ADD COLUMN "gstin" TEXT,
  ADD COLUMN "pan" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "logo" TEXT,
  ADD COLUMN "financialYearStart" DATE,
  ADD COLUMN "financialYearEnd" DATE,
  ADD COLUMN "booksBeginningDate" DATE,
  ADD COLUMN "baseCurrency" TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN "enableAccounting" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "enableInventory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "enableGst" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "enablePayroll" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Company"
SET "code" = 'COMPANY-' || upper(substr(replace("id"::text, '-', ''), 1, 8));

ALTER TABLE "Company" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

ALTER TABLE "User"
  ADD COLUMN "employeeCode" TEXT,
  ADD COLUMN "department" TEXT,
  ADD COLUMN "designation" TEXT,
  ADD COLUMN "mobile" TEXT,
  ADD COLUMN "alternateEmail" TEXT,
  ADD COLUMN "dateOfJoining" DATE;

ALTER TABLE "Role" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Role_id_companyId_key" ON "Role"("id", "companyId");

ALTER TABLE "Permission"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "module" TEXT,
  ADD COLUMN "action" TEXT,
  ADD COLUMN "roleId" UUID;

DELETE FROM "Permission" p
WHERE NOT EXISTS (SELECT 1 FROM "_PermissionToRole" pr WHERE pr."A" = p."id");

UPDATE "Permission" p
SET
  "name" = p."key",
  "module" = split_part(p."key", ':', 1),
  "action" = split_part(p."key", ':', 2),
  "roleId" = (
    SELECT pr."B" FROM "_PermissionToRole" pr
    WHERE pr."A" = p."id"
    ORDER BY pr."B"
    LIMIT 1
  );

INSERT INTO "Permission" ("id", "key", "name", "module", "action", "roleId", "createdAt")
SELECT
  md5(p."id"::text || pr."B"::text)::uuid,
  p."key" || ':' || pr."B"::text,
  p."name",
  p."module",
  p."action",
  pr."B",
  p."createdAt"
FROM "Permission" p
JOIN "_PermissionToRole" pr ON pr."A" = p."id"
WHERE p."roleId" <> pr."B";

ALTER TABLE "Permission"
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "module" SET NOT NULL,
  ALTER COLUMN "action" SET NOT NULL,
  ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "Permission" DROP COLUMN "key";
CREATE UNIQUE INDEX "Permission_roleId_module_action_key" ON "Permission"("roleId", "module", "action");
CREATE INDEX "Permission_module_action_idx" ON "Permission"("module", "action");
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP TABLE "_PermissionToRole";

CREATE TABLE "UserCompanyRole" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "roleId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserCompanyRole_pkey" PRIMARY KEY ("id")
);

INSERT INTO "UserCompanyRole" ("id", "userId", "companyId", "roleId")
SELECT md5(u."id"::text || u."companyId"::text || u."roleId"::text)::uuid, u."id", u."companyId", u."roleId"
FROM "User" u;

ALTER TABLE "User" DROP CONSTRAINT "User_roleId_fkey";
DROP INDEX "User_roleId_idx";
ALTER TABLE "User" DROP COLUMN "roleId";

CREATE UNIQUE INDEX "User_companyId_employeeCode_key" ON "User"("companyId", "employeeCode");
CREATE INDEX "User_companyId_isActive_idx" ON "User"("companyId", "isActive");
CREATE INDEX "User_department_idx" ON "User"("department");
CREATE UNIQUE INDEX "UserCompanyRole_userId_companyId_roleId_key" ON "UserCompanyRole"("userId", "companyId", "roleId");
CREATE INDEX "UserCompanyRole_userId_companyId_idx" ON "UserCompanyRole"("userId", "companyId");
CREATE INDEX "UserCompanyRole_roleId_companyId_idx" ON "UserCompanyRole"("roleId", "companyId");
ALTER TABLE "UserCompanyRole" ADD CONSTRAINT "UserCompanyRole_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCompanyRole" ADD CONSTRAINT "UserCompanyRole_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCompanyRole" ADD CONSTRAINT "UserCompanyRole_roleId_companyId_fkey"
  FOREIGN KEY ("roleId", "companyId") REFERENCES "Role"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ActivityLog" (
  "id" UUID NOT NULL,
  "companyId" UUID,
  "actorUserId" UUID NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "details" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyBackup" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyBackup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivityLog_companyId_entity_entityId_createdAt_idx"
  ON "ActivityLog"("companyId", "entity", "entityId", "createdAt");
CREATE INDEX "ActivityLog_actorUserId_createdAt_idx" ON "ActivityLog"("actorUserId", "createdAt");
CREATE INDEX "CompanyBackup_companyId_createdAt_idx" ON "CompanyBackup"("companyId", "createdAt");
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyBackup" ADD CONSTRAINT "CompanyBackup_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyBackup" ADD CONSTRAINT "CompanyBackup_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;