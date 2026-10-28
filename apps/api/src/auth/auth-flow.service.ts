import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthChallengeType, AuthMethod } from '@prisma/client';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_SETTINGS } from './auth.settings';
import type { AuthSettings } from './auth.settings';
import type { RequestContext } from './auth.types';
import { afterFailedAttempt, isLocked } from './lockout';
import { PasswordService } from './password.service';
import { SessionService, hashToken } from './session.service';
import { toAuthenticatedUser, USER_ACCESS_INCLUDE } from './user.mapper';
import { RegisterDto } from './dto/verify-totp.dto';
import { TotpService } from './totp.service';
import { WhatsappService } from './whatsapp.service';
import { RegistrationDraftService } from './registration-draft.service';

export const INVALID_CREDENTIALS = 'Identifiants invalides';
const CHALLENGE_DURATION_MS = 5 * 60_000;
const MAX_TOTP_ATTEMPTS = 5;

export interface AuthChallengeResponse {
  step: 'enroll_totp' | 'verify_totp' | 'enroll_whatsapp' | 'verify_whatsapp';
  challengeToken: string;
  email: string;
  provisioningUri?: string;
  maskedPhone?: string;
}

export interface CompletedLogin {
  token: string;
  expiresAt: Date;
  user: ReturnType<typeof toAuthenticatedUser>;
}

@Injectable()
export class AuthFlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly totp: TotpService,
    private readonly whatsapp: WhatsappService,
    private readonly registrationDrafts: RegistrationDraftService,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  async validateInvitation(token: string): Promise<{ email: string; roleName: string }> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { role: { select: { name: true } } },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.expiresAt <= new Date()
    ) {
      throw new BadRequestException('Cette invitation est invalide ou expirée.');
    }
    return { email: invitation.email, roleName: invitation.role.name };
  }

  async register(dto: RegisterDto, context: RequestContext): Promise<AuthChallengeResponse> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(dto.token) },
    });
    const now = new Date();
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= now) {
      throw new BadRequestException('Cette invitation est invalide ou expirée.');
    }
    const email = invitation.email.trim().toLowerCase();
    const draft = dto.draftToken
      ? await this.registrationDrafts.getForRegistration(
          dto.draftToken,
          invitation.id,
        )
      : null;
    const firstName = draft?.firstName ?? dto.firstName?.trim();
    const lastName = draft?.lastName ?? dto.lastName?.trim();
    const authMethod = draft?.authMethod ?? dto.authMethod;
    const whatsappPhone = draft?.whatsappPhone ?? dto.whatsappPhone;
    if (!firstName || !lastName || !authMethod) {
      throw new BadRequestException('Terminez les étapes d’inscription avant de créer le compte.');
    }

    let passwordHash = draft?.passwordHash;
    if (!passwordHash) {
      if (!dto.password || dto.password !== dto.confirmPassword) {
        throw new BadRequestException('Les deux mots de passe ne correspondent pas.');
      }
      const problems = this.passwords.checkPolicy(dto.password, email);
      if (problems.length > 0) {
        throw new BadRequestException(`Mot de passe refusé : ${problems.join(', ')}`);
      }
      passwordHash = await this.passwords.hash(dto.password);
    }

    const existing = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Cette adresse e-mail est déjà utilisée.');

    if (authMethod === AuthMethod.WHATSAPP && !whatsappPhone) {
      throw new BadRequestException('Un numéro WhatsApp au format international est requis.');
    }
    if (authMethod === AuthMethod.WHATSAPP) {
      const parsedPhone = parsePhoneNumberFromString(whatsappPhone ?? '');
      if (!parsedPhone?.isValid() || parsedPhone.number !== whatsappPhone) {
        throw new BadRequestException('Saisissez un numéro WhatsApp valide au format international.');
      }
    }
    if (authMethod === AuthMethod.WHATSAPP) this.whatsapp.assertConfigured();
    const secret = authMethod === AuthMethod.TOTP ? this.totp.generateSecret() : undefined;
    const encryptedSecret = secret ? this.totp.encryptSecret(secret) : undefined;
    const user = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          expiresAt: { gt: now },
        },
        data: { acceptedAt: now },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Cette invitation est invalide ou expirée.');
      }
      const created = await tx.user.create({
        data: {
          email,
          firstName,
          lastName,
          passwordHash,
          authMethod,
          ...(encryptedSecret ? { totpSecretEncrypted: encryptedSecret } : {}),
          ...(authMethod === AuthMethod.WHATSAPP
            ? { whatsappPhone }
            : {}),
          roles: { create: { roleId: invitation.roleId } },
        },
        include: USER_ACCESS_INCLUDE,
      });
      await this.audit.record(
        {
          action: 'user.registered',
          entityType: 'user',
          entityId: created.id,
          actorUserId: created.id,
          ...context,
        },
        tx,
      );
      return created;
    });

    if (dto.draftToken) {
      void this.registrationDrafts.delete(dto.draftToken).catch(() => undefined);
    }

    if (user.authMethod === AuthMethod.WHATSAPP && user.whatsappPhone) {
      try {
        return await this.createWhatsappChallenge(
          user.id,
          user.email,
          user.whatsappPhone,
          AuthChallengeType.ENROLL_WHATSAPP,
        );
      } catch (error) {
        if (error instanceof ServiceUnavailableException) {
          throw new ServiceUnavailableException(
            'Le compte est créé, mais le code WhatsApp n’a pas pu être envoyé. Corrigez la configuration Meta puis connectez-vous pour recevoir un nouveau code.',
          );
        }
        throw error;
      }
    }
    return this.createChallenge(user.id, user.email, AuthChallengeType.ENROLL_TOTP, secret);
  }

  async login(
    rawEmail: string,
    password: string,
    context: RequestContext,
  ): Promise<AuthChallengeResponse> {
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
        await this.prisma.user.update({ where: { id: user.id }, data: next });
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
    if (!user.isActive) return refuse('inactive');

    if (user.authMethod === AuthMethod.WHATSAPP) {
      if (!user.whatsappPhone) return refuse('missing_whatsapp_phone');
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: 0,
          lockedUntil: null,
          ...(this.passwords.needsRehash(user.passwordHash)
            ? { passwordHash: await this.passwords.hash(password) }
            : {}),
        },
      });
      return this.createWhatsappChallenge(
        user.id,
        user.email,
        user.whatsappPhone,
        user.whatsappEnabled
          ? AuthChallengeType.LOGIN_WHATSAPP
          : AuthChallengeType.ENROLL_WHATSAPP,
      );
    }

    const setupKey = user.totpSecretEncrypted
      ? this.totp.decryptSecret(user.totpSecretEncrypted)
      : this.totp.generateSecret();
    if (!user.totpSecretEncrypted) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { totpSecretEncrypted: this.totp.encryptSecret(setupKey) },
      });
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        ...(this.passwords.needsRehash(user.passwordHash)
          ? { passwordHash: await this.passwords.hash(password) }
          : {}),
      },
    });

    const type = user.totpEnabled
      ? AuthChallengeType.LOGIN_TOTP
      : AuthChallengeType.ENROLL_TOTP;
    return this.createChallenge(
      user.id,
      user.email,
      type,
      type === AuthChallengeType.ENROLL_TOTP ? setupKey : undefined,
    );
  }

  async verifyChallenge(
    challengeToken: string,
    code: string,
    context: RequestContext,
  ): Promise<CompletedLogin> {
    const now = new Date();
    const challenge = await this.prisma.authChallenge.findUnique({
      where: { tokenHash: hashToken(challengeToken) },
      include: { user: { include: USER_ACCESS_INCLUDE } },
    });
    const isWhatsapp =
      challenge?.type === AuthChallengeType.ENROLL_WHATSAPP ||
      challenge?.type === AuthChallengeType.LOGIN_WHATSAPP;
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt <= now ||
      challenge.attempts >= MAX_TOTP_ATTEMPTS ||
      !challenge.user.isActive ||
      challenge.user.deletedAt ||
      (isWhatsapp
        ? challenge.user.authMethod !== AuthMethod.WHATSAPP ||
          !challenge.user.whatsappPhone ||
          !challenge.codeHash
        : challenge.user.authMethod !== AuthMethod.TOTP ||
          !challenge.user.totpSecretEncrypted)
    ) {
      throw new UnauthorizedException('Code de vérification invalide ou expiré.');
    }

    if (isWhatsapp) {
      const expectedHash = Buffer.from(challenge.codeHash!, 'hex');
      const submittedHash = Buffer.from(hashToken(`${challengeToken}:${code}`), 'hex');
      const valid =
        expectedHash.length === submittedHash.length &&
        timingSafeEqual(expectedHash, submittedHash);
      if (!valid) {
        const attempt = await this.prisma.authChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
          select: { attempts: true },
        });
        if (attempt.attempts >= MAX_TOTP_ATTEMPTS) {
          await this.prisma.authChallenge.updateMany({
            where: { id: challenge.id, consumedAt: null },
            data: { consumedAt: now },
          });
        }
        await this.audit.record({
          action: 'auth.whatsapp.failed',
          entityType: 'user',
          entityId: challenge.userId,
          actorUserId: challenge.userId,
          ...context,
          metadata: { attempts: attempt.attempts },
        });
        throw new UnauthorizedException('Code de vérification invalide ou expiré.');
      }

      const enrolling = challenge.type === AuthChallengeType.ENROLL_WHATSAPP;
      const completion = await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.authChallenge.updateMany({
          where: {
            id: challenge.id,
            consumedAt: null,
            expiresAt: { gt: now },
            attempts: { lt: MAX_TOTP_ATTEMPTS },
            codeHash: challenge.codeHash,
          },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) return null;
        const advanced = await tx.user.updateMany({
          where: {
            id: challenge.userId,
            deletedAt: null,
            isActive: true,
            authMethod: AuthMethod.WHATSAPP,
            whatsappEnabled: !enrolling,
            whatsappPhone: { not: null },
          },
          data: {
            ...(enrolling ? { whatsappEnabled: true, whatsappEnabledAt: now } : {}),
            lastLoginAt: now,
          },
        });
        if (advanced.count !== 1) return null;
        return tx.user.findUnique({
          where: { id: challenge.userId },
          include: USER_ACCESS_INCLUDE,
        });
      });
      if (!completion) {
        await this.audit.record({
          action: 'auth.whatsapp.failed',
          entityType: 'user',
          entityId: challenge.userId,
          actorUserId: challenge.userId,
          ...context,
          metadata: { reason: 'expired_or_replayed' },
        });
        throw new UnauthorizedException('Code de vérification invalide ou expiré.');
      }

      const session = await this.sessions.create(completion.id, context, now);
      await this.audit.record({
        action: enrolling ? 'auth.whatsapp.enabled' : 'auth.login.succeeded',
        entityType: 'user',
        entityId: completion.id,
        actorUserId: completion.id,
        ...context,
      });
      return { ...session, user: toAuthenticatedUser(completion) };
    }

    if (!challenge.user.totpSecretEncrypted) {
      throw new UnauthorizedException('Code de vérification invalide ou expiré.');
    }
    const secret = this.totp.decryptSecret(challenge.user.totpSecretEncrypted);
    const counter = this.totp.matchingCounter(secret, code, now);
    if (counter === null) {
      const attempt = await this.prisma.authChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      if (attempt.attempts >= MAX_TOTP_ATTEMPTS) {
        await this.prisma.authChallenge.updateMany({
          where: { id: challenge.id, consumedAt: null },
          data: { consumedAt: now },
        });
      }
      await this.audit.record({
        action: 'auth.totp.failed',
        entityType: 'user',
        entityId: challenge.userId,
        actorUserId: challenge.userId,
        ...context,
        metadata: { attempts: attempt.attempts },
      });
      throw new UnauthorizedException('Code de vérification invalide ou expiré.');
    }

    const completion = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: now },
          attempts: { lt: MAX_TOTP_ATTEMPTS },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) return null;
      const enrolling = challenge.type === AuthChallengeType.ENROLL_TOTP;
      const advanced = await tx.user.updateMany({
        where: {
          id: challenge.userId,
          deletedAt: null,
          isActive: true,
          authMethod: AuthMethod.TOTP,
          totpEnabled: !enrolling,
          OR: [
            { totpLastCounter: null },
            { totpLastCounter: { lt: counter } },
          ],
        },
        data: {
          totpLastCounter: counter,
          ...(enrolling
            ? { totpEnabled: true, totpEnabledAt: now, authMethod: AuthMethod.TOTP }
            : {}),
          lastLoginAt: now,
        },
      });
      if (advanced.count !== 1) return null;
      return tx.user.findUnique({
        where: { id: challenge.userId },
        include: USER_ACCESS_INCLUDE,
      });
    });
    if (!completion) {
      await this.audit.record({
        action: 'auth.totp.failed',
        entityType: 'user',
        entityId: challenge.userId,
        actorUserId: challenge.userId,
        ...context,
        metadata: { reason: 'expired_or_replayed' },
      });
      throw new UnauthorizedException('Code de vérification invalide ou expiré.');
    }

    const session = await this.sessions.create(completion.id, context, now);
    await this.audit.record({
      action:
        challenge.type === AuthChallengeType.ENROLL_TOTP
          ? 'auth.totp.enabled'
          : 'auth.login.succeeded',
      entityType: 'user',
      entityId: completion.id,
      actorUserId: completion.id,
      ...context,
    });
    return { ...session, user: toAuthenticatedUser(completion) };
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
    if (!user?.passwordHash) throw new UnauthorizedException(INVALID_CREDENTIALS);
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

  private async createChallenge(
    userId: string,
    email: string,
    type: AuthChallengeType,
    setupKey?: string,
  ): Promise<AuthChallengeResponse> {
    const now = new Date();
    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      await tx.authChallenge.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.authChallenge.create({
        data: {
          tokenHash: hashToken(token),
          userId,
          type,
          createdAt: now,
          expiresAt: new Date(now.getTime() + CHALLENGE_DURATION_MS),
        },
      });
    });
    return {
      step: type === AuthChallengeType.ENROLL_TOTP ? 'enroll_totp' : 'verify_totp',
      challengeToken: token,
      email,
      ...(setupKey ? { provisioningUri: this.totp.provisioningUri(email, setupKey) } : {}),
    };
  }

  private async createWhatsappChallenge(
    userId: string,
    email: string,
    phone: string,
    type: AuthChallengeType,
  ): Promise<AuthChallengeResponse> {
    const now = new Date();
    const token = randomBytes(32).toString('base64url');
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const challenge = await this.prisma.$transaction(async (tx) => {
      await tx.authChallenge.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: now },
      });
      return tx.authChallenge.create({
        data: {
          tokenHash: hashToken(token),
          codeHash: hashToken(`${token}:${code}`),
          userId,
          type,
          createdAt: now,
          expiresAt: new Date(now.getTime() + CHALLENGE_DURATION_MS),
        },
        select: { id: true },
      });
    });

    try {
      await this.whatsapp.sendAuthenticationCode(phone, code);
    } catch (error) {
      await this.prisma.authChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      throw error;
    }

    return {
      step: type === AuthChallengeType.ENROLL_WHATSAPP ? 'enroll_whatsapp' : 'verify_whatsapp',
      challengeToken: token,
      email,
      maskedPhone: maskPhone(phone),
    };
  }
}

function maskPhone(phone: string): string {
  const visibleSuffix = phone.slice(-2);
  return `${phone.slice(0, 4)}••••••${visibleSuffix}`;
}
