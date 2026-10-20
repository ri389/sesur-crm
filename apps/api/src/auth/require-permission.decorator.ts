import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION = 'require_permission';

export interface RequiredPermission {
  resource: string;
  action: string;
}

export const RequirePermission = (resource: string, action: string) =>
  SetMetadata(REQUIRE_PERMISSION, { resource, action } satisfies RequiredPermission);
