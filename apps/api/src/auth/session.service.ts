import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_SETTINGS } from './auth.settings';
import type { AuthSettings } from './auth.settings';
import { RequestContext } from './auth.types';
import { toAuthenticatedUser, USER_ACCESS_INCLUDE } from './user.mapper';

type AuthenticatedUser = ReturnType<typeof toAuthenticatedUser>;

/** Évite une écriture en base à chaque requête pour suivre l'activité. */
const LAST_SEEN_RESOLUTION_MS = 60_000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface ResolvedSession {
  sessionId: string;
  user: AuthenticatedUser;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  async create(
    userId: string,
    context: RequestContext,
    now = new Date(),
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + this.settings.sessionAbsoluteMs);
    await this.prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
    return { token, expiresAt };
  }

  /** Renvoie la session et son utilisateur si elle est encore valide. */
  async resolve(
    token: string,
    now = new Date(),
  ): Promise<ResolvedSession | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: { include: USER_ACCESS_INCLUDE },
      },
    });
    if (!session || session.revokedAt) return null;

    const idleDeadline =
      session.lastSeenAt.getTime() + this.settings.sessionIdleMs;
    if (session.expiresAt <= now || idleDeadline <= now.getTime()) return null;

    const { user } = session;
    if (!user.isActive || user.deletedAt) return null;

    if (
      now.getTime() - session.lastSeenAt.getTime() >=
      LAST_SEEN_RESOLUTION_MS
    ) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: now },
      });
    }

    return {
      sessionId: session.id,
      user: toAuthenticatedUser(user),
    };
  }

  async revokeAllForUser(userId: string, now = new Date()): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  /** Révoque la session du jeton ; renvoie l'utilisateur concerné, s'il y en a un. */
  async revoke(token: string, now = new Date()): Promise<string | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!session || session.revokedAt) return null;
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: now },
    });
    return session.userId;
  }
}
