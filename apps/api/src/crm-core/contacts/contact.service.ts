import { Injectable, NotFoundException } from '@nestjs/common';
import { Contact, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
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

  async findAll(params: ContactFindAllParams = {}): Promise<Contact[]> {
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
      include: {
        organization: { select: { id: true, name: true, isClient: true } },
      },
    });
  }

  async findById(id: string): Promise<Contact> {
    const contact = await this.prisma.contact.findFirst({
      where: { id, deletedAt: null },
      include: {
        organization: true,
        interactions: {
          orderBy: { occurredAt: 'desc' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!contact) {
      throw new NotFoundException(`Contact introuvable (ID: ${id})`);
    }

    return contact;
  }

  async create(dto: CreateContactDto, actorUserId?: string): Promise<Contact> {
    const contact = await this.prisma.contact.create({
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        organizationId: dto.organizationId || null,
        email: dto.email?.trim().toLowerCase() || null,
        phone: dto.phone?.trim() || null,
        jobTitle: dto.jobTitle?.trim() || null,
        preferences: dto.preferences?.trim() || null,
      },
      include: {
        organization: { select: { id: true, name: true, isClient: true } },
      },
    });

    await this.audit.record({
      action: 'contact.created',
      entityType: 'contact',
      entityId: contact.id,
      actorUserId: actorUserId ?? null,
      metadata: { organizationId: contact.organizationId },
    });

    return contact;
  }

  async update(
    id: string,
    dto: UpdateContactDto,
    actorUserId?: string,
  ): Promise<Contact> {
    await this.findById(id);

    const updated = await this.prisma.contact.update({
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
      include: {
        organization: { select: { id: true, name: true, isClient: true } },
      },
    });

    await this.audit.record({
      action: 'contact.updated',
      entityType: 'contact',
      entityId: id,
      actorUserId: actorUserId ?? null,
      metadata: { changes: dto as unknown as Prisma.InputJsonObject },
    });

    return updated;
  }

  async delete(id: string, actorUserId?: string): Promise<void> {
    await this.findById(id);

    await this.prisma.contact.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.audit.record({
      action: 'contact.deleted',
      entityType: 'contact',
      entityId: id,
      actorUserId: actorUserId ?? null,
    });
  }
}
