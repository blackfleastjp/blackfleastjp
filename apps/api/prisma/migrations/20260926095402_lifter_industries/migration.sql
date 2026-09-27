/*
  Warnings:

  - You are about to drop the column `description` on the `Permission` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "User_companyId_idx";

-- AlterTable
ALTER TABLE "Permission" DROP COLUMN "description";
