import { Injectable, NotFoundException } from '@nestjs/common';
import { Organization, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
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

  async findAll(params: OrgFindAllParams = {}): Promise<Organization[]> {
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

    return this.prisma.organization.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { contacts: true, leads: true, interactions: true } },
      },
    });
  }

  async findById(id: string): Promise<Organization> {
    const org = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
      include: {
        contacts: { where: { deletedAt: null } },
        leads: { where: { deletedAt: null } },
        interactions: {
          orderBy: { occurredAt: 'desc' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
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
    const org = await this.prisma.organization.create({
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

    await this.audit.record({
      action: 'organization.created',
      entityType: 'organization',
      entityId: org.id,
      actorUserId: actorUserId ?? null,
      metadata: { isClient: org.isClient },
    });

    return org;
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
    actorUserId?: string,
  ): Promise<Organization> {
    await this.findById(id);

    const updated = await this.prisma.organization.update({
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

    await this.audit.record({
      action: 'organization.updated',
      entityType: 'organization',
      entityId: id,
      actorUserId: actorUserId ?? null,
      metadata: {
        changes: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonObject,
      },
    });

    return updated;
  }

  async delete(id: string, actorUserId?: string): Promise<void> {
    await this.findById(id);

    await this.prisma.organization.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.audit.record({
      action: 'organization.deleted',
      entityType: 'organization',
      entityId: id,
      actorUserId: actorUserId ?? null,
    });
  }
}
