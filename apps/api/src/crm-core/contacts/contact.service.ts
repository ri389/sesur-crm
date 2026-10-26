import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Contact, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { effectiveScope } from '../../auth/rbac';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';

export interface ContactFindAllParams {
  organizationId?: string;
  search?: string;
}

@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private includeFor(user: AuthenticatedUser, withInteractions = false): Prisma.ContactInclude {
    const include: Prisma.ContactInclude = {};
    if (effectiveScope(user, 'organization', 'read')) {
      include.organization = { select: { id: true, name: true, isClient: true } };
    }
    if (withInteractions && effectiveScope(user, 'interaction', 'read')) {
      include.interactions = {
        orderBy: { occurredAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      };
    }
    return include;
  }

  private async assertOrganizationReadable(
    tx: Prisma.TransactionClient,
    organizationId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (!effectiveScope(user, 'organization', 'read')) {
      throw new ForbiddenException('Vous ne pouvez pas lier ce contact à une organisation.');
    }
    const organization = await tx.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!organization) throw new NotFoundException('Organisation introuvable.');
  }

  async findAll(params: ContactFindAllParams, user: AuthenticatedUser): Promise<Contact[]> {
    if (params.organizationId && !effectiveScope(user, 'organization', 'read')) {
      throw new ForbiddenException('Vous ne pouvez pas filtrer les contacts par organisation.');
    }
    const where: Prisma.ContactWhereInput = {
      deletedAt: null,
      ...(params.organizationId
        ? { organizationId: params.organizationId }
        : {}),
      ...(params.search
        ? {
            OR: [
              { firstName: { contains: params.search, mode: 'insensitive' } },
              { lastName: { contains: params.search, mode: 'insensitive' } },
              { email: { contains: params.search, mode: 'insensitive' } },
              { phone: { contains: params.search } },
              { jobTitle: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.contact.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: this.includeFor(user),
    });
  }

  async findById(id: string, user: AuthenticatedUser): Promise<Contact> {
    const contact = await this.prisma.contact.findFirst({
      where: { id, deletedAt: null },
      include: this.includeFor(user, true),
    });

    if (!contact) {
      throw new NotFoundException(`Contact introuvable (ID: ${id})`);
    }

    return contact;
  }

  async create(dto: CreateContactDto, user: AuthenticatedUser): Promise<Contact> {
    return this.prisma.$transaction(async (tx) => {
      if (dto.organizationId) {
        await this.assertOrganizationReadable(tx, dto.organizationId, user);
      }
      const contact = await tx.contact.create({
        data: {
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          organizationId: dto.organizationId || null,
          email: dto.email?.trim().toLowerCase() || null,
          phone: dto.phone?.trim() || null,
          jobTitle: dto.jobTitle?.trim() || null,
          preferences: dto.preferences?.trim() || null,
        },
        include: this.includeFor(user),
      });

      await this.audit.record(
        {
          action: 'contact.created',
          entityType: 'contact',
          entityId: contact.id,
          actorUserId: user.id,
          metadata: { organizationId: contact.organizationId },
        },
        tx,
      );
      return contact;
    });
  }

  async update(
    id: string,
    dto: UpdateContactDto,
    user: AuthenticatedUser,
  ): Promise<Contact> {
    return this.prisma.$transaction(async (tx) => {
      if (dto.organizationId) {
        await this.assertOrganizationReadable(tx, dto.organizationId, user);
      }
      const existing = await tx.contact.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException(`Contact introuvable (ID: ${id})`);
      }

      const updated = await tx.contact.update({
        where: { id },
        data: {
          ...(dto.firstName !== undefined
            ? { firstName: dto.firstName.trim() }
            : {}),
          ...(dto.lastName !== undefined
            ? { lastName: dto.lastName.trim() }
            : {}),
          ...(dto.organizationId !== undefined
            ? { organizationId: dto.organizationId }
            : {}),
          ...(dto.email !== undefined
            ? { email: dto.email?.trim().toLowerCase() || null }
            : {}),
          ...(dto.phone !== undefined
            ? { phone: dto.phone?.trim() || null }
            : {}),
          ...(dto.jobTitle !== undefined
            ? { jobTitle: dto.jobTitle?.trim() || null }
            : {}),
          ...(dto.preferences !== undefined
            ? { preferences: dto.preferences?.trim() || null }
            : {}),
        },
        include: this.includeFor(user),
      });

      await this.audit.record(
        {
          action: 'contact.updated',
          entityType: 'contact',
          entityId: id,
          actorUserId: user.id,
          metadata: { changedFields: Object.keys(dto) },
        },
        tx,
      );

      return updated;
    });
  }

  async delete(id: string, actorUserId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.contact.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException(`Contact introuvable (ID: ${id})`);
      }

      await tx.contact.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'contact.deleted',
          entityType: 'contact',
          entityId: id,
          actorUserId: actorUserId ?? null,
        },
        tx,
      );
    });
  }
}
