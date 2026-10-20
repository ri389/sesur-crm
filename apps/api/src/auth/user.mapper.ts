import { PermissionScope } from '@prisma/client';
import type { AuthenticatedUser, PermissionGrant } from './auth.types';

type RolePermissionRow = {
  scope: PermissionScope;
  permission: { resource: string; action: string };
};

type UserWithAccess = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  teamId: string | null;
  roles: Array<{
    role: {
      code: string;
      permissions: RolePermissionRow[];
    };
  }>;
};

export function toAuthenticatedUser(user: UserWithAccess): AuthenticatedUser {
  const permissions: PermissionGrant[] = [];
  for (const membership of user.roles) {
    for (const row of membership.role.permissions) {
      permissions.push({
        resource: row.permission.resource,
        action: row.permission.action,
        scope: row.scope,
      });
    }
  }
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    teamId: user.teamId,
    roles: user.roles.map((membership) => membership.role.code),
    permissions,
  };
}

export const USER_ACCESS_INCLUDE = {
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
} as const;
