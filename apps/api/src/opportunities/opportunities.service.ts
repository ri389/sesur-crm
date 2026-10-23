import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OpportunityStage,
  PermissionScope,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { effectiveScope } from '../auth/rbac';
import {
  AuthenticatedUser,
  RequestContext,
} from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { ListOpportunitiesDto } from './dto/list-opportunities.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { UpdateOpportunityStageDto } from './dto/update-opportunity-stage.dto';

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private scopeWhere(
    user: AuthenticatedUser,
    scope: PermissionScope,
  ): Prisma.OpportunityWhereInput {
    switch (scope) {
      case PermissionScope.OWN:
        return { ownerUserId: user.id };

      case PermissionScope.TEAM:
        // Sans équipe, on limite l'accès aux opportunités propres.
        return user.teamId
          ? { owner: { is: { teamId: user.teamId } } }
          : { ownerUserId: user.id };

      case PermissionScope.ALL:
        return {};
    }
  }

  private requireScope(
    user: AuthenticatedUser,
    action: string,
  ): PermissionScope {
    const scope = effectiveScope(user, 'opportunity', action);

    if (!scope) {
      throw new ForbiddenException('Accès refusé');
    }

    return scope;
  }

  private async findAccessible(
    id: string,
    user: AuthenticatedUser,
    action: string,
  ) {
    const scope = this.requireScope(user, action);

    const opportunity = await this.prisma.opportunity.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.scopeWhere(user, scope),
      },
    });

    if (!opportunity) {
      // Ne pas révéler l'existence d'une opportunité inaccessible.
      throw new NotFoundException('Opportunité introuvable');
    }

    return opportunity;
  }

  private async assertOwnerAssignable(
    ownerUserId: string,
    user: AuthenticatedUser,
    scope: PermissionScope,
  ): Promise<void> {
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerUserId },
      select: { id: true, teamId: true },
    });

    if (!owner) {
      throw new BadRequestException('Responsable introuvable');
    }

    if (
      scope === PermissionScope.OWN &&
      owner.id !== user.id
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez attribuer une opportunité qu’à vous-même',
      );
    }

    if (
      scope === PermissionScope.TEAM &&
      (!user.teamId || owner.teamId !== user.teamId)
    ) {
      throw new ForbiddenException(
        'Le responsable doit appartenir à votre équipe',
      );
    }
  }

  async create(
    dto: CreateOpportunityDto,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    const scope = this.requireScope(user, 'create');
    const ownerUserId = dto.ownerUserId ?? user.id;

    await this.assertOwnerAssignable(ownerUserId, user, scope);

    const data: Prisma.OpportunityCreateInput = {
      name: dto.name.trim(),
      description: dto.description,
      amount: new Prisma.Decimal(dto.amount ?? '0'),
      probability: dto.probability ?? 0,
      expectedCloseDate: dto.expectedCloseDate
        ? new Date(dto.expectedCloseDate)
        : undefined,
      owner: { connect: { id: ownerUserId } },
      createdBy: { connect: { id: user.id } },
      ...(dto.leadId
        ? { lead: { connect: { id: dto.leadId } } }
        : {}),
      ...(dto.organizationId
        ? {
            organization: {
              connect: { id: dto.organizationId },
            },
          }
        : {}),
      ...(dto.contactId
        ? { contact: { connect: { id: dto.contactId } } }
        : {}),
    };

    const opportunity = await this.prisma.opportunity.create({
      data,
    });

    await this.audit.record({
      action: 'opportunity.created',
      entityType: 'opportunity',
      entityId: opportunity.id,
      actorUserId: user.id,
      ...context,
      metadata: {
        name: opportunity.name,
        ownerUserId: opportunity.ownerUserId,
      },
    });

    return opportunity;
  }

  async findAll(
    query: ListOpportunitiesDto,
    user: AuthenticatedUser,
  ) {
    const scope = this.requireScope(user, 'read');
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number(query.limit) || 20),
    );

    const where: Prisma.OpportunityWhereInput = {
      deletedAt: null,
      ...this.scopeWhere(user, scope),
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.ownerUserId
        ? { ownerUserId: query.ownerUserId }
        : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              {
                name: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                description: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.opportunity.findMany({
        where,
        include: {
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              teamId: true,
            },
          },
          organization: {
            select: { id: true, name: true },
          },
          contact: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.opportunity.count({ where }),
    ]);

    return {
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, user: AuthenticatedUser) {
  const scope = this.requireScope(user, 'read');

  const opportunity = await this.prisma.opportunity.findFirst({
    where: {
      id,
      deletedAt: null,
      ...this.scopeWhere(user, scope),
    },
    include: {
      owner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          teamId: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      lead: true,
      organization: true,
      contact: true,
      quotes: { where: { deletedAt: null } },
      tasks: { where: { deletedAt: null } },
      calendarEvents: { where: { deletedAt: null } },
    },
  });

  if (!opportunity) {
    throw new NotFoundException('Opportunité introuvable');
  }

  return opportunity;
}

  async update(
    id: string,
    dto: UpdateOpportunityDto,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    const current = await this.findAccessible(id, user, 'update');
    const scope = this.requireScope(user, 'update');

    if (dto.ownerUserId) {
      await this.assertOwnerAssignable(dto.ownerUserId, user, scope);
    }

    const data: Prisma.OpportunityUpdateInput = {
      ...(dto.name !== undefined
        ? { name: dto.name.trim() }
        : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.amount !== undefined
        ? { amount: new Prisma.Decimal(dto.amount) }
        : {}),
      ...(dto.probability !== undefined
        ? { probability: dto.probability }
        : {}),
      ...(dto.expectedCloseDate !== undefined
        ? {
            expectedCloseDate: dto.expectedCloseDate
              ? new Date(dto.expectedCloseDate)
              : null,
          }
        : {}),
      ...(dto.leadId !== undefined
        ? {
            lead: dto.leadId
              ? { connect: { id: dto.leadId } }
              : { disconnect: true },
          }
        : {}),
      ...(dto.organizationId !== undefined
        ? {
            organization: dto.organizationId
              ? { connect: { id: dto.organizationId } }
              : { disconnect: true },
          }
        : {}),
      ...(dto.contactId !== undefined
        ? {
            contact: dto.contactId
              ? { connect: { id: dto.contactId } }
              : { disconnect: true },
          }
        : {}),
      ...(dto.ownerUserId
        ? { owner: { connect: { id: dto.ownerUserId } } }
        : {}),
    };

    const updated = await this.prisma.opportunity.update({
      where: { id: current.id },
      data,
    });

    await this.audit.record({
      action: 'opportunity.updated',
      entityType: 'opportunity',
      entityId: id,
      actorUserId: user.id,
      ...context,
      metadata: { changedFields: Object.keys(dto) },
    });

    return updated;
  }

  async updateStage(
    id: string,
    dto: UpdateOpportunityStageDto,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    const current = await this.findAccessible(id, user, 'update');

    if (
      dto.stage === OpportunityStage.LOST &&
      !dto.lostReason?.trim()
    ) {
      throw new BadRequestException(
        'Veuillez préciser la raison de la perte',
      );
    }

    const isClosed =
      dto.stage === OpportunityStage.WON ||
      dto.stage === OpportunityStage.LOST;

    const updated = await this.prisma.opportunity.update({
      where: { id: current.id },
      data: {
        stage: dto.stage,
        closedAt: isClosed ? new Date() : null,
        lostReason:
          dto.stage === OpportunityStage.LOST
            ? dto.lostReason!.trim()
            : null,
      },
    });

    await this.audit.record({
      action: 'opportunity.stage_changed',
      entityType: 'opportunity',
      entityId: id,
      actorUserId: user.id,
      ...context,
      metadata: {
        previousStage: current.stage,
        newStage: dto.stage,
      },
    });

    return updated;
  }

  async remove(
    id: string,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    const current = await this.findAccessible(id, user, 'delete');

    const deleted = await this.prisma.opportunity.update({
      where: { id: current.id },
      data: { deletedAt: new Date() },
    });

    await this.audit.record({
      action: 'opportunity.deleted',
      entityType: 'opportunity',
      entityId: id,
      actorUserId: user.id,
      ...context,
      metadata: { name: current.name },
    });

    return { id: deleted.id, deleted: true };
  }
}