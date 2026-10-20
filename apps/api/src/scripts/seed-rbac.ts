/**
 * Crée (ou met à jour) les rôles système et leurs permissions.
 * Usage : pnpm --filter api db:seed
 */
import { PermissionScope, PrismaClient } from '@prisma/client';
import { ROLE_DEFINITIONS, uniquePermissionKeys } from '../auth/rbac';

export async function seedRbac(prisma: PrismaClient): Promise<void> {
  const permissionKeys = uniquePermissionKeys();
  const permissionIds = new Map<string, string>();

  for (const key of permissionKeys) {
    const permission = await prisma.permission.upsert({
      where: {
        resource_action: { resource: key.resource, action: key.action },
      },
      create: {
        resource: key.resource,
        action: key.action,
        description: `${key.action} ${key.resource}`,
      },
      update: {},
    });
    permissionIds.set(`${key.resource}:${key.action}`, permission.id);
  }

  for (const definition of ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { code: definition.code },
      create: {
        code: definition.code,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
      update: {
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (definition.grants.length === 0) continue;
    await prisma.rolePermission.createMany({
      data: definition.grants.map((grant) => ({
        roleId: role.id,
        permissionId: permissionIds.get(`${grant.resource}:${grant.action}`)!,
        scope: grant.scope as PermissionScope,
      })),
    });
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedRbac(prisma);
    console.log('Rôles et permissions système enregistrés.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
