import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Lead, LeadStatus, PermissionScope, Prisma } from '@prisma/client';
import { leadScopeWhere } from '../../auth/access';
import type { AccessContext } from '../../auth/access';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DuplicateService } from '../duplicates/duplicate.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

export interface LeadFindAllParams {
  status?: LeadStatus;
  search?: string;
  assignedUserId?: string;
}

@Injectable()
export class LeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly duplicates: DuplicateService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    params: LeadFindAllParams = {},
    access?: AccessContext,
  ): Promise<Lead[]> {
    const where: Prisma.LeadWhereInput = {
      deletedAt: null,
      AND: [
        access ? leadScopeWhere(access) : {},
        params.status ? { status: params.status } : {},
        params.assignedUserId ? { assignedUserId: params.assignedUserId } : {},
        params.search
          ? {
              OR: [
                { firstName: { contains: params.search, mode: 'insensitive' } },
                { lastName: { contains: params.search, mode: 'insensitive' } },
                {
                  companyName: { contains: params.search, mode: 'insensitive' },
                },
                { email: { contains: params.search, mode: 'insensitive' } },
                { phone: { contains: params.search } },
              ],
            }
          : {},
      ],
    };

    return this.prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        assignedUser: {
          select: { id: true, firstName: true, lastName: true },
        },
        organization: { select: { id: true, name: true, isClient: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findById(id: string, access?: AccessContext): Promise<Lead> {
    const lead = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null, ...(access ? leadScopeWhere(access) : {}) },
      include: {
        assignedUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        organization: true,
        contact: true,
        interactions: {
          orderBy: { occurredAt: 'desc' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!lead) {
      throw new NotFoundException(`Prospect introuvable (ID: ${id})`);
    }

    return lead;
  }

  private async assertAssigneeAssignable(
    assignedUserId: string,
    access?: AccessContext,
  ): Promise<void> {
    if (!access || access.scope === PermissionScope.ALL) return;

    if (access.scope === PermissionScope.OWN) {
      if (assignedUserId !== access.userId) {
        throw new ForbiddenException(
          'Vous ne pouvez attribuer un prospect qu’à vous-même.',
        );
      }
      return;
    }

    if (!access.teamId) {
      if (assignedUserId === access.userId) return;
      throw new ForbiddenException(
        'Sans équipe, vous ne pouvez attribuer un prospect qu’à vous-même.',
      );
    }

    const assignee = await this.prisma.user.findFirst({
      where: { id: assignedUserId, deletedAt: null, isActive: true },
      select: { teamId: true },
    });
    if (assignee?.teamId !== access.teamId) {
      throw new ForbiddenException(
        'Le responsable doit appartenir à votre équipe.',
      );
    }
  }

  async create(
    dto: CreateLeadDto,
    actorUserId?: string,
    access?: AccessContext,
  ): Promise<Lead> {
    const assignedUserId = dto.assignedUserId || actorUserId || null;
    if (assignedUserId) {
      await this.assertAssigneeAssignable(assignedUserId, access);
    }

    // 1. Vérification des doublons potentiels
    if (!dto.bypassDuplicateWarning) {
      const candidates = await this.duplicates.checkDuplicates(
        {
          email: dto.email,
          phone: dto.phone,
          companyName: dto.companyName,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
        access,
      );

      if (candidates.length > 0 && candidates[0].score >= 70) {
        throw new HttpException(
          {
            statusCode: HttpStatus.CONFLICT,
            message: 'Des doublons potentiels ont été détectés.',
            candidates,
          },
          HttpStatus.CONFLICT,
        );
      }
    }

    // 2. Création du prospect
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          companyName: dto.companyName?.trim() || null,
          email: dto.email?.trim().toLowerCase() || null,
          phone: dto.phone?.trim() || null,
          source: dto.source || 'AUTRE',
          status: LeadStatus.NEW,
          score: dto.score ?? 0,
          assignedUserId,
        },
        include: {
          assignedUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      await this.audit.record(
        {
          action: 'lead.created',
          entityType: 'lead',
          entityId: lead.id,
          actorUserId: actorUserId ?? null,
          metadata: {
            source: lead.source,
            bypassedDuplicates: Boolean(dto.bypassDuplicateWarning),
          },
        },
        tx,
      );
      return lead;
    });
  }

  async update(
    id: string,
    dto: UpdateLeadDto,
    actorUserId?: string,
    access?: AccessContext,
  ): Promise<Lead> {
    if (dto.assignedUserId) {
      await this.assertAssigneeAssignable(dto.assignedUserId, access);
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.lead.findFirst({
        where: {
          id,
          deletedAt: null,
          ...(access ? leadScopeWhere(access) : {}),
        },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException(`Prospect introuvable (ID: ${id})`);
      }

      const updated = await tx.lead.update({
        where: { id },
        data: {
          ...(dto.firstName !== undefined
            ? { firstName: dto.firstName.trim() }
            : {}),
          ...(dto.lastName !== undefined
            ? { lastName: dto.lastName.trim() }
            : {}),
          ...(dto.companyName !== undefined
            ? { companyName: dto.companyName?.trim() || null }
            : {}),
          ...(dto.email !== undefined
            ? { email: dto.email?.trim().toLowerCase() || null }
            : {}),
          ...(dto.phone !== undefined
            ? { phone: dto.phone?.trim() || null }
            : {}),
          ...(dto.source !== undefined ? { source: dto.source } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.score !== undefined ? { score: dto.score } : {}),
          ...(dto.assignedUserId !== undefined
            ? { assignedUserId: dto.assignedUserId }
            : {}),
        },
      });

      await this.audit.record({
        action: 'lead.updated',
        entityType: 'lead',
        entityId: id,
        actorUserId: actorUserId ?? null,
        metadata: { changedFields: Object.keys(dto) },
      }, tx);

      return updated;
    });
  }

  async delete(
    id: string,
    actorUserId?: string,
    access?: AccessContext,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.lead.findFirst({
        where: { id, deletedAt: null, ...(access ? leadScopeWhere(access) : {}) },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException(`Prospect introuvable (ID: ${id})`);

      await tx.lead.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'lead.deleted',
          entityType: 'lead',
          entityId: id,
          actorUserId: actorUserId ?? null,
        },
        tx,
      );
    });
  }

  async qualify(
    id: string,
    actorUserId?: string,
    access?: AccessContext,
  ): Promise<Lead> {
    return this.update(
      id,
      { status: LeadStatus.QUALIFIED },
      actorUserId,
      access,
    );
  }

  async convertToClient(
    id: string,
    actorUserId?: string,
    access?: AccessContext,
  ): Promise<{ lead: Lead; organization: unknown; contact: unknown }> {
    const lead = await this.findById(id, access);

    if (lead.status === LeadStatus.CONVERTED) {
      throw new BadRequestException(
        'Ce prospect a déjà été converti en client.',
      );
    }

    const now = new Date();
    const orgName = lead.companyName || `${lead.firstName} ${lead.lastName}`;

    const [organization, contact, updatedLead] = await this.prisma.$transaction(
      async (tx) => {
        // Créer l'organisation cliente
        const org = await tx.organization.create({
          data: {
            name: orgName,
            phone: lead.phone,
            email: lead.email,
            isClient: true,
            status: 'ACTIVE_CLIENT',
            becameCustomerDate: now,
          },
        });

        // Créer le contact principal rattaché
        const ct = await tx.contact.create({
          data: {
            organizationId: org.id,
            firstName: lead.firstName,
            lastName: lead.lastName,
            email: lead.email,
            phone: lead.phone,
          },
        });

        // Mettre à jour le prospect
        const l = await tx.lead.update({
          where: { id },
          data: {
            status: LeadStatus.CONVERTED,
            convertedAt: now,
            organizationId: org.id,
            contactId: ct.id,
          },
        });

        // Associer les interactions du prospect à l'organisation et au contact
        await tx.interaction.updateMany({
          where: { leadId: id },
          data: { organizationId: org.id, contactId: ct.id },
        });

        return [org, ct, l];
      },
    );

    await this.audit.record({
      action: 'lead.converted',
      entityType: 'lead',
      entityId: id,
      actorUserId: actorUserId ?? null,
      metadata: {
        organizationId: organization.id,
        contactId: contact.id,
      },
    });

    return { lead: updatedLead, organization, contact };
  }
}
