import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SESSION_COOKIE_NAME } from './auth.settings';
import { AuthenticatedRequest } from './auth.types';
import { IS_PUBLIC } from './public.decorator';
import { SessionService } from './session.service';

/** Garde globale : refuse toute route non marquée @Public() sans session valide. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token: unknown = req.cookies?.[SESSION_COOKIE_NAME];
    const resolved =
      typeof token === 'string' && token !== ''
        ? await this.sessions.resolve(token)
        : null;
    if (!resolved) {
      throw new UnauthorizedException('Authentification requise');
    }
    req.user = resolved.user;
    req.sessionId = resolved.sessionId;
    return true;
  }
}
