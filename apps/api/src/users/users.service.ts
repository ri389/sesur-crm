import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { hashToken } from '../auth/session.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvitationDto, UpdateUserDto } from './dto/user.dto';
import { EmailService } from './email.service';

const USER_PUBLIC = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  teamId: true,
  managerId: true,
  lastLoginAt: true,
  createdAt: true,
  team: { select: { id: true, name: true } },
  roles: { include: { role: { select: { id: true, code: true, name: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  list() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: USER_PUBLIC,
    });
  }

  listRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, description: true, isSystem: true },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_PUBLIC,
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  async createInvitation(
    dto: CreateInvitationDto,
    actorUserId: string,
    requestOrigin?: string,
  ) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing?.deletedAt) {
      if (this.config.get<string>('APP_ENV') !== 'development') {
        throw new ConflictException('Cette adresse e-mail est déjà utilisée par un compte précédemment désactivé.');
      }
      await this.permanentlyDelete(existing.id, actorUserId, 'user.purged');
    } else if (existing) {
      throw new ConflictException('Cette adresse e-mail est déjà utilisée.');
    }
    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
      select: { id: true, name: true, code: true },
    });
    if (!role) throw new BadRequestException('Le rôle sélectionné est introuvable.');

    const configuredOrigin = this.config.get<string>('APP_ORIGIN')?.trim();
    const origin = configuredOrigin || requestOrigin || 'http://localhost:5173';
    let appOrigin: string;
    try {
      const parsedOrigin = new URL(origin);
      if (!['http:', 'https:'].includes(parsedOrigin.protocol)) throw new Error();
      appOrigin = parsedOrigin.origin;
    } catch {
      throw new BadRequestException('APP_ORIGIN doit être une origine HTTP ou HTTPS valide.');
    }

    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const ttlMinutes = this.invitationTtlMinutes();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);
    const invitation = await this.prisma.$transaction(async (tx) => {
      // Invalidate older links while retaining their rows for the invitation history.
      await tx.invitation.updateMany({
        where: { email, acceptedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      });
      const created = await tx.invitation.create({
        data: {
          email,
          tokenHash: hashToken(token),
          roleId: role.id,
          invitedByUserId: actorUserId,
          createdAt: now,
          expiresAt,
        },
      });
      await this.audit.record(
        {
          action: 'user.invited',
          entityType: 'invitation',
          entityId: created.id,
          actorUserId,
          metadata: { email, roleCode: role.code, expiresAt: expiresAt.toISOString() },
        },
        tx,
      );
      return created;
    });

    const invitationUrl = `${appOrigin}/#/inscription?token=${encodeURIComponent(token)}`;
    try {
      await this.email.sendInvitation(email, role.name, invitationUrl, ttlMinutes);
    } catch (error) {
      await this.prisma.invitation.deleteMany({
        where: { id: invitation.id, acceptedAt: null },
      });
      throw error;
    }

    return { email, role: { id: role.id, name: role.name }, expiresAt };
  }

  async createInvitations(
    emails: string[],
    roleId: string,
    actorUserId: string,
    requestOrigin?: string,
  ) {
    const results: Array<{
      email: string;
      success: boolean;
      expiresAt?: Date;
      error?: string;
    }> = [];
    for (const rawEmail of emails) {
      const email = rawEmail.trim().toLowerCase();
      try {
        const invitation = await this.createInvitation(
          { email, roleId },
          actorUserId,
          requestOrigin,
        );
        results.push({ email, success: true, expiresAt: invitation.expiresAt });
      } catch (error) {
        const response = error instanceof HttpException ? error.getResponse() : null;
        const message =
          typeof response === 'string'
            ? response
            : response && typeof response === 'object' && 'message' in response
              ? response.message
              : null;
        results.push({
          email,
          success: false,
          error: Array.isArray(message)
            ? message.filter((item): item is string => typeof item === 'string').join(', ')
            : typeof message === 'string'
              ? message
              : 'L’invitation n’a pas pu être envoyée.',
        });
      }
    }
    return results;
  }

  async listInvitations() {
    const now = new Date();
    const invitations = await this.prisma.invitation.findMany({
      orderBy: [{ createdAt: 'desc' }, { email: 'asc' }],
      select: {
        id: true,
        email: true,
        createdAt: true,
        expiresAt: true,
        acceptedAt: true,
        role: { select: { id: true, name: true } },
      },
    });
    return invitations.map((invitation) => ({
      ...invitation,
      status: invitation.acceptedAt
        ? 'approved'
        : invitation.expiresAt <= now
          ? 'expired'
          : 'pending',
    }));
  }

  async invitationEmailIndex() {
    const now = new Date();
    const [users, invitations] = await Promise.all([
      this.prisma.user.findMany({ select: { email: true } }),
      this.prisma.invitation.findMany({
        where: { acceptedAt: null, expiresAt: { gt: now } },
        select: { email: true },
      }),
    ]);
    return {
      registered: [...new Set(users.map(({ email }) => email.toLowerCase()))],
      pending: [...new Set(invitations.map(({ email }) => email.toLowerCase()))],
    };
  }

  async resendInvitation(
    id: string,
    actorUserId: string,
    requestOrigin?: string,
  ) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id },
      select: { email: true, roleId: true, acceptedAt: true },
    });
    if (!invitation) throw new NotFoundException('Invitation introuvable.');
    if (invitation.acceptedAt) {
      throw new BadRequestException('Cette invitation a déjà été acceptée.');
    }
    return this.createInvitation(
      { email: invitation.email, roleId: invitation.roleId },
      actorUserId,
      requestOrigin,
    );
  }

  async update(id: string, dto: UpdateUserDto, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Utilisateur introuvable');

      if (dto.roleIds !== undefined) {
        await tx.userRole.deleteMany({ where: { userId: id } });
      }

      const user = await tx.user.update({
        where: { id },
        data: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
          ...(dto.teamId !== undefined ? { teamId: dto.teamId } : {}),
          ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.roleIds !== undefined
            ? { roles: { create: dto.roleIds.map((roleId) => ({ roleId })) } }
            : {}),
        },
        select: USER_PUBLIC,
      });

      if (dto.isActive === false) {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await this.audit.record({
        action: 'user.updated',
        entityType: 'user',
        entityId: id,
        actorUserId,
      }, tx);
      return user;
    });
  }

  async delete(id: string, actorUserId: string) {
    if (id === actorUserId) {
      throw new BadRequestException('Vous ne pouvez pas supprimer votre propre compte.');
    }
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Utilisateur introuvable');
    if (this.config.get<string>('APP_ENV') === 'development') {
      await this.permanentlyDelete(id, actorUserId, 'user.deleted');
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false, passwordHash: null },
      });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        { action: 'user.deleted', entityType: 'user', entityId: id, actorUserId },
        tx,
      );
    });
  }

  private async permanentlyDelete(
    id: string,
    actorUserId: string,
    action: 'user.deleted' | 'user.purged',
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.invitation.deleteMany({ where: { invitedByUserId: id } });
        await tx.user.delete({ where: { id } });
        await this.audit.record(
          {
            action,
            entityType: 'user',
            entityId: id,
            actorUserId,
          },
          tx,
        );
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Ce compte est encore référencé par des données métier. Réattribuez ou supprimez ces données avant de supprimer définitivement le compte.',
        );
      }
      throw error;
    }
  }

  private invitationTtlMinutes(): number {
    const configured = this.config.get<string>('INVITATION_TTL_MINUTES')?.trim();
    const minutes = configured ? Number(configured) : 15;
    if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 43_200) {
      throw new ServiceUnavailableException(
        'INVITATION_TTL_MINUTES doit être un entier compris entre 1 et 43200.',
      );
    }
    return minutes;
  }
}
