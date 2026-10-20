import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedRequest } from './auth.types';
import { IS_PUBLIC } from './public.decorator';
import { effectiveScope } from './rbac';
import {
  REQUIRE_PERMISSION,
  RequiredPermission,
} from './require-permission.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<RequiredPermission>(
      REQUIRE_PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = req.user;
    if (!user || !effectiveScope(user, required.resource, required.action)) {
      if (user) {
        await this.audit.record({
          action: 'authz.denied',
          entityType: required.resource,
          actorUserId: user.id,
          metadata: { action: required.action },
        });
      }
      throw new ForbiddenException('Accès refusé');
    }
    return true;
  }
}
