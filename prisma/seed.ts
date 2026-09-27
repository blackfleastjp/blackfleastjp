import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const permissionKeys = [
  "company.read",
  "company.manage",
  "users.read",
  "users.manage",
  "audit.read",
] as const;

async function main(): Promise<void> {
  await prisma.permission.createMany({
    data: permissionKeys.map((key) => ({
      key,
      description: `Permission to ${key.replace(".", " ")}`,
    })),
    skipDuplicates: true,
  });
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
