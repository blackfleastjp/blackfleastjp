import { PrismaClient } from "@prisma/client";
import { permissionDefinitions } from "@erp/shared";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.permission.createMany({
    data: permissionDefinitions.map((permission) => ({
      ...permission,
      description: permission.name,
    })),
    skipDuplicates: true,
  });

  const administrators = await prisma.role.findMany({
    where: { companyId: { not: null }, name: "Administrator", isSystem: true },
    select: { id: true },
  });
  const permissions = await prisma.permission.findMany({
    where: { key: { in: permissionDefinitions.map((permission) => permission.key) } },
    select: { id: true },
  });
  await prisma.rolePermission.createMany({
    data: administrators.flatMap((role) =>
      permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
    ),
    skipDuplicates: true,
  });
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
