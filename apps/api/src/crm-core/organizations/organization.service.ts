import { Injectable, NotFoundException } from '@nestjs/common';
import { Organization, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { accessFor, leadScopeWhere } from '../../auth/access';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { effectiveScope } from '../../auth/rbac';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';

export interface OrgFindAllParams {
  isClient?: boolean;
  search?: string;
}

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    params: OrgFindAllParams,
    user: AuthenticatedUser,
  ): Promise<Organization[]> {
    const where: Prisma.OrganizationWhereInput = {
      deletedAt: null,
      ...(params.isClient !== undefined ? { isClient: params.isClient } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { industry: { contains: params.search, mode: 'insensitive' } },
              { email: { contains: params.search, mode: 'insensitive' } },
              { phone: { contains: params.search } },
            ],
          }
        : {}),
    };

    const include: Prisma.OrganizationInclude = {};
    if (effectiveScope(user, 'contact', 'read')) {
      include._count = { select: { contacts: true } };
    }

    return this.prisma.organization.findMany({
      where,
      orderBy: { name: 'asc' },
      include,
    });
  }

  async findById(id: string, user: AuthenticatedUser): Promise<Organization> {
    const include: Prisma.OrganizationInclude = {};
    if (effectiveScope(user, 'contact', 'read')) {
      include.contacts = { where: { deletedAt: null } };
    }
    if (effectiveScope(user, 'lead', 'read')) {
      include.leads = {
        where: {
          deletedAt: null,
          ...leadScopeWhere(accessFor(user, 'lead', 'read')),
        },
      };
    }
    if (effectiveScope(user, 'interaction', 'read')) {
      include.interactions = {
        orderBy: { occurredAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      };
    }

    const org = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
      include,
    });

    if (!org) {
      throw new NotFoundException(`Organisation introuvable (ID: ${id})`);
    }

    return org;
  }

  async create(
    dto: CreateOrganizationDto,
    actorUserId?: string,
  ): Promise<Organization> {
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.name.trim(),
          industry: dto.industry?.trim() || null,
          address: dto.address?.trim() || null,
          phone: dto.phone?.trim() || null,
          email: dto.email?.trim().toLowerCase() || null,
          isClient: dto.isClient ?? false,
          becameCustomerDate: dto.isClient ? new Date() : null,
          status: dto.status || (dto.isClient ? 'ACTIVE_CLIENT' : 'PROSPECT'),
        },
      });

      await this.audit.record(
        {
          action: 'organization.created',
          entityType: 'organization',
          entityId: org.id,
          actorUserId: actorUserId ?? null,
          metadata: { isClient: org.isClient },
        },
        tx,
      );
      return org;
    });
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
    actorUserId?: string,
  ): Promise<Organization> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.organization.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException(`Organisation introuvable (ID: ${id})`);
      }

      const updated = await tx.organization.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.industry !== undefined
            ? { industry: dto.industry?.trim() || null }
            : {}),
          ...(dto.address !== undefined
            ? { address: dto.address?.trim() || null }
            : {}),
          ...(dto.phone !== undefined
            ? { phone: dto.phone?.trim() || null }
            : {}),
          ...(dto.email !== undefined
            ? { email: dto.email?.trim().toLowerCase() || null }
            : {}),
          ...(dto.isClient !== undefined
            ? {
                isClient: dto.isClient,
                ...(dto.isClient ? { becameCustomerDate: new Date() } : {}),
              }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });

      await this.audit.record(
        {
          action: 'organization.updated',
          entityType: 'organization',
          entityId: id,
          actorUserId: actorUserId ?? null,
          metadata: { changedFields: Object.keys(dto) },
        },
        tx,
      );

      return updated;
    });
  }

  async delete(id: string, actorUserId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.organization.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException(`Organisation introuvable (ID: ${id})`);
      }

      await tx.organization.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'organization.deleted',
          entityType: 'organization',
          entityId: id,
          actorUserId: actorUserId ?? null,
        },
        tx,
      );
    });
  }
}
