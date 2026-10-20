import { PermissionScope, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from './auth.types';
import { effectiveScope } from './rbac';

export interface AccessContext {
  userId: string;
  teamId: string | null;
  scope: PermissionScope;
}

export function accessFor(
  user: AuthenticatedUser,
  resource: string,
  action: string,
): AccessContext {
  const scope = effectiveScope(user, resource, action);
  if (!scope) {
    throw new Error(`Permission manquante : ${resource}:${action}`);
  }
  return { userId: user.id, teamId: user.teamId, scope };
}

/** Filtre SQL du périmètre pour les prospects (propriétaire = assignedUser). */
export function leadScopeWhere(access: AccessContext): Prisma.LeadWhereInput {
  if (access.scope === PermissionScope.ALL) return {};
  if (access.scope === PermissionScope.OWN) {
    return { assignedUserId: access.userId };
  }
  return {
    OR: [
      { assignedUserId: access.userId },
      ...(access.teamId
        ? [{ assignedUser: { teamId: access.teamId } }]
        : []),
    ],
  };
}
