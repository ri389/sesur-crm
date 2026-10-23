import { PermissionScope } from '@prisma/client';
import type { AuthenticatedUser, PermissionGrant } from './auth.types';

export const RESOURCES = [
  'user',
  'team',
  'role',
  'lead',
  'opportunity',
  'contact',
  'organization',
  'product',
  'interaction',
  'audit',
  'import',
  'search',
  'duplicate',
  'quote',
] as const;

export type Resource = (typeof RESOURCES)[number];

const CRUD = ['read', 'create', 'update', 'delete'] as const;

export interface RoleDefinition {
  code: string;
  name: string;
  description: string;
  grants: PermissionGrant[];
}

function grants(
  resource: Resource,
  actions: readonly string[],
  scope: PermissionScope,
): PermissionGrant[] {
  return actions.map((action) => ({ resource, action, scope }));
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    code: 'ADMIN',
    name: 'Administrateur',
    description: 'Accès complet au CRM',
    grants: [
      ...RESOURCES.flatMap((resource) =>
        grants(
          resource,
          resource === 'duplicate'
            ? ['merge']
            : resource === 'import'
              ? ['create']
              : resource === 'search' || resource === 'audit'
                ? ['read']
                : resource === 'lead'
                  ? [...CRUD, 'convert']
                  : resource === 'interaction'
                    ? ['read', 'create', 'delete']
                    : [...CRUD],
          PermissionScope.ALL,
        ),
      ),
    ],
  },
  {
    code: 'DIRECTION',
    name: 'Direction',
    description: 'Lecture large et audit',
    grants: [
      ...grants('lead', ['read'], PermissionScope.ALL),
      ...grants('contact', ['read'], PermissionScope.ALL),
      ...grants('organization', ['read'], PermissionScope.ALL),
      ...grants('product', ['read'], PermissionScope.ALL),
      ...grants('interaction', ['read'], PermissionScope.ALL),
      ...grants('user', ['read'], PermissionScope.ALL),
      ...grants('audit', ['read'], PermissionScope.ALL),
      ...grants('search', ['read'], PermissionScope.ALL),
      ...grants('opportunity', ['read'], PermissionScope.ALL),
      ...grants('quote', ['read'], PermissionScope.ALL),
    ],
  },
  {
    code: 'SALES_MANAGER',
    name: 'Responsable commercial',
    description: 'Pilotage de l’équipe commerciale',
    grants: [
      ...grants('lead', [...CRUD, 'convert'], PermissionScope.ALL),
      ...grants('contact', [...CRUD], PermissionScope.ALL),
      ...grants('organization', [...CRUD], PermissionScope.ALL),
      ...grants('interaction', ['read', 'create'], PermissionScope.ALL),
      ...grants('product', ['read'], PermissionScope.ALL),
      ...grants('user', ['read'], PermissionScope.ALL),
      ...grants('duplicate', ['merge'], PermissionScope.ALL),
      ...grants('import', ['create'], PermissionScope.ALL),
      ...grants('search', ['read'], PermissionScope.ALL),
      ...grants('audit', ['read'], PermissionScope.ALL),
      ...grants('opportunity', [...CRUD], PermissionScope.ALL),
      ...grants('quote', [...CRUD], PermissionScope.ALL),
    ],
  },
  {
    code: 'SALES_REP',
    name: 'Commercial',
    description: 'Suivi des prospects et clients de l’équipe',
    grants: [
      ...grants('lead', ['read', 'create', 'update', 'convert'], PermissionScope.TEAM),
      ...grants('contact', ['read', 'create', 'update'], PermissionScope.ALL),
      ...grants('organization', ['read', 'create', 'update'], PermissionScope.ALL),
      ...grants('interaction', ['read', 'create'], PermissionScope.ALL),
      ...grants('product', ['read'], PermissionScope.ALL),
      ...grants('search', ['read'], PermissionScope.ALL),
      ...grants('opportunity',['read', 'create', 'update'],PermissionScope.TEAM,),
      ...grants('quote', ['read', 'create', 'update'], PermissionScope.TEAM),
    ],
  },
  {
    code: 'SAV_AGENT',
    name: 'Agent SAV',
    description: 'Consultation clients et journal d’interactions',
    grants: [
      ...grants('contact', ['read'], PermissionScope.ALL),
      ...grants('organization', ['read'], PermissionScope.ALL),
      ...grants('interaction', ['read', 'create'], PermissionScope.ALL),
      ...grants('search', ['read'], PermissionScope.ALL),
    ],
  },
  {
    code: 'SAV_MANAGER',
    name: 'Responsable SAV',
    description: 'Suivi clients et historique SAV',
    grants: [
      ...grants('contact', ['read', 'update'], PermissionScope.ALL),
      ...grants('organization', ['read', 'update'], PermissionScope.ALL),
      ...grants('interaction', ['read', 'create'], PermissionScope.ALL),
      ...grants('search', ['read'], PermissionScope.ALL),
    ],
  },
  {
    code: 'MARKETING',
    name: 'Marketing',
    description: 'Consultation des contacts et organisations',
    grants: [
      ...grants('contact', ['read'], PermissionScope.ALL),
      ...grants('organization', ['read'], PermissionScope.ALL),
      ...grants('search', ['read'], PermissionScope.ALL),
    ],
  },
];

const SCOPE_RANK: Record<PermissionScope, number> = {
  OWN: 1,
  TEAM: 2,
  ALL: 3,
};

/** Plus large périmètre accordé pour une ressource × action, ou null. */
export function effectiveScope(
  user: AuthenticatedUser,
  resource: string,
  action: string,
): PermissionScope | null {
  let best: PermissionScope | null = null;
  for (const grant of user.permissions) {
    if (grant.resource !== resource || grant.action !== action) continue;
    if (!best || SCOPE_RANK[grant.scope] > SCOPE_RANK[best]) {
      best = grant.scope;
    }
  }
  return best;
}

export function uniquePermissionKeys(
  definitions: RoleDefinition[] = ROLE_DEFINITIONS,
): Array<{ resource: string; action: string }> {
  const seen = new Set<string>();
  const keys: Array<{ resource: string; action: string }> = [];
  for (const role of definitions) {
    for (const grant of role.grants) {
      const key = `${grant.resource}:${grant.action}`;
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push({ resource: grant.resource, action: grant.action });
    }
  }
  return keys;
}
