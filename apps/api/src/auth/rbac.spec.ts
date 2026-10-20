import { PermissionScope } from '@prisma/client';
import { effectiveScope, ROLE_DEFINITIONS } from './rbac';
import type { AuthenticatedUser } from './auth.types';

function userWith(
  grants: AuthenticatedUser['permissions'],
): AuthenticatedUser {
  return {
    id: 'u1',
    email: 'a@sesur.bj',
    firstName: 'A',
    lastName: 'B',
    teamId: null,
    roles: [],
    permissions: grants,
  };
}

describe('effectiveScope', () => {
  it('prend le périmètre le plus large', () => {
    const user = userWith([
      { resource: 'lead', action: 'read', scope: PermissionScope.OWN },
      { resource: 'lead', action: 'read', scope: PermissionScope.TEAM },
    ]);
    expect(effectiveScope(user, 'lead', 'read')).toBe(PermissionScope.TEAM);
  });

  it('renvoie null si la permission manque', () => {
    expect(effectiveScope(userWith([]), 'lead', 'read')).toBeNull();
  });
});

describe('ROLE_DEFINITIONS', () => {
  it('définit un administrateur avec un accès complet aux prospects', () => {
    const admin = ROLE_DEFINITIONS.find((r) => r.code === 'ADMIN');
    expect(admin?.grants).toEqual(
      expect.arrayContaining([
        {
          resource: 'lead',
          action: 'convert',
          scope: PermissionScope.ALL,
        },
      ]),
    );
  });
});
