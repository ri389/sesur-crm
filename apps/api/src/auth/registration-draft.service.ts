import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { AuthMethod } from '@prisma/client';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { hashToken } from './session.service';
import type {
  CreateRegistrationDraftDto,
  SaveRegistrationDraftDto,
} from './dto/verify-totp.dto';
import { RedisCacheService } from './redis-cache.service';

export interface RegistrationDraft {
  invitationId: string;
  firstName?: string;
  lastName?: string;
  passwordHash?: string;
  authMethod?: AuthMethod;
  whatsappPhone?: string;
}

export interface RegistrationDraftView {
  draftToken: string;
  firstName: string;
  lastName: string;
  passwordSaved: boolean;
  authMethod: AuthMethod | null;
  whatsappPhone: string;
  completedStep: 0 | 1 | 2 | 3;
  expiresAt: Date;
}

const DRAFT_KEY_PREFIX = 'sesur:registration-draft:';

@Injectable()
export class RegistrationDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly redis: RedisCacheService,
  ) {}

  async createOrResume(
    dto: CreateRegistrationDraftDto,
  ): Promise<RegistrationDraftView> {
    const invitation = await this.findUsableInvitation(dto.invitationToken);
    if (dto.draftToken) {
      const existing = await this.read(dto.draftToken);
      if (existing?.invitationId === invitation.id) {
        return this.toView(dto.draftToken, existing, invitation.expiresAt);
      }
    }

    const draftToken = randomBytes(32).toString('base64url');
    const draft: RegistrationDraft = { invitationId: invitation.id };
    await this.write(draftToken, draft, invitation.expiresAt);
    return this.toView(draftToken, draft, invitation.expiresAt);
  }

  async save(dto: SaveRegistrationDraftDto): Promise<RegistrationDraftView> {
    const draft = await this.read(dto.draftToken);
    if (!draft) throw new BadRequestException('La session d’inscription a expiré.');
    const invitation = await this.findUsableInvitationById(draft.invitationId);

    if (dto.step === 'identity') {
      const firstName = dto.firstName?.trim();
      const lastName = dto.lastName?.trim();
      if (!firstName || !lastName) {
        throw new BadRequestException('Saisissez votre prénom et votre nom.');
      }
      draft.firstName = firstName;
      draft.lastName = lastName;
    } else if (dto.step === 'password') {
      if (!draft.firstName || !draft.lastName) {
        throw new BadRequestException('Complétez d’abord votre identité.');
      }
      const password = dto.password ?? '';
      if (password !== dto.confirmPassword) {
        throw new BadRequestException('Les deux mots de passe ne correspondent pas.');
      }
      const problems = this.passwords.checkPolicy(password, invitation.email);
      if (problems.length > 0) {
        throw new BadRequestException(`Mot de passe refusé : ${problems.join(', ')}`);
      }
      draft.passwordHash = await this.passwords.hash(password);
    } else {
      if (!draft.passwordHash) {
        throw new BadRequestException('Définissez d’abord votre mot de passe.');
      }
      if (!dto.authMethod) {
        throw new BadRequestException('Choisissez une méthode de vérification.');
      }
      draft.authMethod = dto.authMethod;
      if (dto.authMethod === AuthMethod.WHATSAPP) {
        const phone = parsePhoneNumberFromString(dto.whatsappPhone ?? '');
        if (!phone?.isValid() || phone.number !== dto.whatsappPhone) {
          throw new BadRequestException('Saisissez un numéro WhatsApp valide.');
        }
        draft.whatsappPhone = phone.number;
      } else {
        delete draft.whatsappPhone;
      }
    }

    await this.write(dto.draftToken, draft, invitation.expiresAt);
    return this.toView(dto.draftToken, draft, invitation.expiresAt);
  }

  async getForRegistration(
    draftToken: string,
    invitationId: string,
  ): Promise<RegistrationDraft> {
    const draft = await this.read(draftToken);
    if (!draft || draft.invitationId !== invitationId) {
      throw new BadRequestException('La session d’inscription a expiré.');
    }
    await this.findUsableInvitationById(invitationId);
    if (
      !draft.firstName ||
      !draft.lastName ||
      !draft.passwordHash ||
      !draft.authMethod
    ) {
      throw new BadRequestException('Terminez les étapes d’inscription avant de créer le compte.');
    }
    if (draft.authMethod === AuthMethod.WHATSAPP && !draft.whatsappPhone) {
      throw new BadRequestException('Saisissez un numéro WhatsApp valide.');
    }
    return draft;
  }

  async delete(draftToken: string): Promise<void> {
    await this.redis.delete(this.key(draftToken));
  }

  private async findUsableInvitation(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, email: true, acceptedAt: true, expiresAt: true },
    });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
      throw new BadRequestException('Cette invitation est invalide ou expirée.');
    }
    return invitation;
  }

  private async findUsableInvitationById(id: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id },
      select: { id: true, email: true, acceptedAt: true, expiresAt: true },
    });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
      throw new BadRequestException('Cette invitation est invalide ou expirée.');
    }
    return invitation;
  }

  private async read(draftToken: string): Promise<RegistrationDraft | null> {
    const value = await this.redis.get(this.key(draftToken));
    if (!value) return null;
    try {
      return JSON.parse(value) as RegistrationDraft;
    } catch {
      await this.redis.delete(this.key(draftToken));
      return null;
    }
  }

  private async write(
    draftToken: string,
    draft: RegistrationDraft,
    expiresAt: Date,
  ): Promise<void> {
    const ttlSeconds = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
    if (ttlSeconds <= 0) {
      throw new BadRequestException('Cette invitation est invalide ou expirée.');
    }
    await this.redis.set(this.key(draftToken), JSON.stringify(draft), ttlSeconds);
  }

  private key(draftToken: string): string {
    return `${DRAFT_KEY_PREFIX}${hashToken(draftToken)}`;
  }

  private toView(
    draftToken: string,
    draft: RegistrationDraft,
    expiresAt: Date,
  ): RegistrationDraftView {
    const completedStep: RegistrationDraftView['completedStep'] = draft.authMethod
      ? 3
      : draft.passwordHash
        ? 2
        : draft.firstName && draft.lastName
          ? 1
          : 0;
    return {
      draftToken,
      firstName: draft.firstName ?? '',
      lastName: draft.lastName ?? '',
      passwordSaved: Boolean(draft.passwordHash),
      authMethod: draft.authMethod ?? null,
      whatsappPhone: draft.whatsappPhone ?? '',
      completedStep,
      expiresAt,
    };
  }
}
