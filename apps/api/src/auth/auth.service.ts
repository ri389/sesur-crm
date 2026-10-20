import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_SETTINGS } from './auth.settings';
import type { AuthSettings } from './auth.settings';
import { AuthenticatedUser, RequestContext } from './auth.types';
import { afterFailedAttempt, isLocked } from './lockout';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { toAuthenticatedUser, USER_ACCESS_INCLUDE } from './user.mapper';

/** Message unique pour ne pas révéler si le compte existe, est verrouillé ou désactivé. */
export const INVALID_CREDENTIALS = 'Identifiants invalides';

export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  async login(
    rawEmail: string,
    password: string,
    context: RequestContext,
  ): Promise<LoginResult> {
    const now = new Date();
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: USER_ACCESS_INCLUDE,
    });

    const refuse = async (
      reason: string,
      metadata: Record<string, string | number> = {},
    ): Promise<never> => {
      await this.audit.record({
        action: 'auth.login.failed',
        entityType: 'user',
        entityId: user?.id ?? null,
        actorUserId: user?.id ?? null,
        ...context,
        metadata: { reason, ...metadata },
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    };

    if (!user || !user.passwordHash) {
      await this.passwords.verifyAgainstDummy(password);
      return refuse(user ? 'no_password' : 'unknown_user');
    }

    if (isLocked(user.lockedUntil, now)) {
      await this.passwords.verifyAgainstDummy(password);
      return refuse('locked');
    }

    if (!(await this.passwords.verify(user.passwordHash, password))) {
      const { failedLoginCount } = await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      const next = afterFailedAttempt(failedLoginCount, this.settings, now);
      if (next.lockedUntil) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: next,
        });
        await this.audit.record({
          action: 'auth.account.locked',
          entityType: 'user',
          entityId: user.id,
          actorUserId: user.id,
          ...context,
          metadata: { lockedUntil: next.lockedUntil.toISOString() },
        });
      }
      return refuse('bad_password', { failedLoginCount });
    }

    if (!user.isActive) {
      return refuse('inactive');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
        ...(this.passwords.needsRehash(user.passwordHash)
          ? { passwordHash: await this.passwords.hash(password) }
          : {}),
      },
    });
    const session = await this.sessions.create(user.id, context, now);
    await this.audit.record({
      action: 'auth.login.succeeded',
      entityType: 'user',
      entityId: user.id,
      actorUserId: user.id,
      ...context,
    });

    return {
      ...session,
      user: toAuthenticatedUser(user),
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    context: RequestContext,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user?.passwordHash) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (!(await this.passwords.verify(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const problems = this.passwords.checkPolicy(newPassword, user.email);
    if (problems.length > 0) {
      throw new BadRequestException(`Mot de passe refusé : ${problems.join(', ')}`);
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(newPassword) },
    });
    await this.sessions.revokeAllForUser(userId);
    await this.audit.record({
      action: 'auth.password.changed',
      entityType: 'user',
      entityId: userId,
      actorUserId: userId,
      ...context,
    });
  }

  async logout(token: string, context: RequestContext): Promise<void> {
    const userId = await this.sessions.revoke(token);
    if (!userId) return;
    await this.audit.record({
      action: 'auth.logout',
      entityType: 'user',
      entityId: userId,
      actorUserId: userId,
      ...context,
    });
  }
}
