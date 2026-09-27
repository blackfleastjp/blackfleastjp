import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & { erpPrisma?: PrismaClient };

export const prisma = globalForPrisma.erpPrisma ?? new PrismaClient();

if (process.env["NODE_ENV"] !== "production") globalForPrisma.erpPrisma = prisma;
