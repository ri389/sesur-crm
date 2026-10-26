import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PermissionScope, Prisma, TaskStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser, RequestContext } from '../auth/auth.types';
import { effectiveScope } from '../auth/rbac';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, ListTasksDto, UpdateTaskDto } from './dto/activity.dto';

type TaskRelatedRecords = {
  opportunity: {
    id: string;
    name: string;
    ownerUserId: string;
    owner: { teamId: string | null };
  } | null;
  organization: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  quote: {
    id: string;
    number: string;
    createdByUserId: string;
    createdBy: { teamId: string | null };
  } | null;
};

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private requireScope(user: AuthenticatedUser, action: string): PermissionScope {
    const scope = effectiveScope(user, 'task', action);
    if (!scope) throw new ForbiddenException('Accès refusé');
    return scope;
  }

  private scopeWhere(
    user: AuthenticatedUser,
    scope: PermissionScope,
  ): Prisma.TaskWhereInput {
    if (scope === PermissionScope.ALL) return {};
    if (scope === PermissionScope.OWN || !user.teamId) {
      return {
        OR: [{ assignedUserId: user.id }, { createdByUserId: user.id }],
      };
    }
    return {
      OR: [
        { assignedUserId: user.id },
        { createdByUserId: user.id },
        { assignedUser: { is: { teamId: user.teamId } } },
        { createdBy: { is: { teamId: user.teamId } } },
      ],
    };
  }

  private async assertAssignee(
    assignedUserId: string,
    user: AuthenticatedUser,
    scope: PermissionScope,
  ): Promise<void> {
    const assignee = await this.prisma.user.findFirst({
      where: { id: assignedUserId, isActive: true, deletedAt: null },
      select: { id: true, teamId: true },
    });
    if (!assignee) throw new BadRequestException('Responsable introuvable ou inactif.');
    if (scope === PermissionScope.OWN && assignee.id !== user.id) {
      throw new ForbiddenException('Vous ne pouvez attribuer une tâche qu’à vous-même.');
    }
    if (
      scope === PermissionScope.TEAM &&
      assignee.id !== user.id &&
      (!user.teamId || assignee.teamId !== user.teamId)
    ) {
      throw new ForbiddenException('Le responsable doit appartenir à votre équipe.');
    }
  }

  private async assertLinks(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    links: Pick<CreateTaskDto, 'opportunityId' | 'organizationId' | 'contactId' | 'quoteId'>,
  ): Promise<void> {
    if (links.opportunityId) {
      const scope = effectiveScope(user, 'opportunity', 'read');
      if (!scope) throw new ForbiddenException('Vous ne pouvez pas lier une opportunité.');
      const where: Prisma.OpportunityWhereInput = {
        id: links.opportunityId,
        deletedAt: null,
        ...(scope === PermissionScope.OWN
          ? { ownerUserId: user.id }
          : scope === PermissionScope.TEAM
            ? user.teamId
              ? { owner: { is: { teamId: user.teamId } } }
              : { ownerUserId: user.id }
            : {}),
      };
      if (!(await tx.opportunity.findFirst({ where, select: { id: true } }))) {
        throw new NotFoundException('Opportunité introuvable.');
      }
    }

    if (links.organizationId) {
      if (!effectiveScope(user, 'organization', 'read')) {
        throw new ForbiddenException('Vous ne pouvez pas lier un client.');
      }
      if (!(await tx.organization.findFirst({
        where: { id: links.organizationId, deletedAt: null },
        select: { id: true },
      }))) throw new NotFoundException('Client introuvable.');
    }

    if (links.contactId) {
      if (!effectiveScope(user, 'contact', 'read')) {
        throw new ForbiddenException('Vous ne pouvez pas lier un contact.');
      }
      if (!(await tx.contact.findFirst({
        where: { id: links.contactId, deletedAt: null },
        select: { id: true },
      }))) throw new NotFoundException('Contact introuvable.');
    }

    if (links.quoteId) {
      const scope = effectiveScope(user, 'quote', 'read');
      if (!scope) throw new ForbiddenException('Vous ne pouvez pas lier un devis.');
      const where: Prisma.QuoteWhereInput = {
        id: links.quoteId,
        deletedAt: null,
        ...(scope === PermissionScope.ALL
          ? {}
          : scope === PermissionScope.TEAM && user.teamId
            ? { createdBy: { is: { teamId: user.teamId } } }
            : { createdByUserId: user.id }),
      };
      if (!(await tx.quote.findFirst({ where, select: { id: true } }))) {
        throw new NotFoundException('Devis introuvable.');
      }
    }
  }

  private readonly include = {
    assignedUser: { select: { id: true, firstName: true, lastName: true } },
    createdBy: { select: { id: true, firstName: true, lastName: true } },
    opportunity: {
      select: {
        id: true,
        name: true,
        ownerUserId: true,
        owner: { select: { teamId: true } },
      },
    },
    organization: { select: { id: true, name: true } },
    contact: { select: { id: true, firstName: true, lastName: true } },
    quote: {
      select: {
        id: true,
        number: true,
        createdByUserId: true,
        createdBy: { select: { teamId: true } },
      },
    },
  } satisfies Prisma.TaskInclude;

  private canReadOpportunityLink(
    opportunity: NonNullable<TaskRelatedRecords['opportunity']>,
    user: AuthenticatedUser,
  ): boolean {
    const scope = effectiveScope(user, 'opportunity', 'read');
    if (scope === PermissionScope.ALL) return true;
    if (scope === PermissionScope.OWN) return opportunity.ownerUserId === user.id;
    if (scope === PermissionScope.TEAM) {
      return user.teamId
        ? opportunity.owner.teamId === user.teamId
        : opportunity.ownerUserId === user.id;
    }
    return false;
  }

  private canReadQuoteLink(
    quote: NonNullable<TaskRelatedRecords['quote']>,
    user: AuthenticatedUser,
  ): boolean {
    const scope = effectiveScope(user, 'quote', 'read');
    if (scope === PermissionScope.ALL) return true;
    if (scope === PermissionScope.OWN) return quote.createdByUserId === user.id;
    if (scope === PermissionScope.TEAM) {
      return user.teamId
        ? quote.createdBy.teamId === user.teamId
        : quote.createdByUserId === user.id;
    }
    return false;
  }

  private visibleRelatedRecords<T extends TaskRelatedRecords>(
    task: T,
    user: AuthenticatedUser,
  ) {
    const { opportunity, organization, contact, quote, ...fields } = task;
    return {
      ...fields,
      opportunity: opportunity && this.canReadOpportunityLink(opportunity, user)
        ? { id: opportunity.id, name: opportunity.name }
        : null,
      organization: effectiveScope(user, 'organization', 'read') ? organization : null,
      contact: effectiveScope(user, 'contact', 'read') ? contact : null,
      quote: quote && this.canReadQuoteLink(quote, user)
        ? { id: quote.id, number: quote.number }
        : null,
    };
  }

  async findAll(query: ListTasksDto, user: AuthenticatedUser) {
    const scope = this.requireScope(user, 'read');
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('La date de début doit précéder la date de fin.');
    }
    const where: Prisma.TaskWhereInput = {
      deletedAt: null,
      AND: [
        this.scopeWhere(user, scope),
        query.status ? { status: query.status } : {},
        query.priority ? { priority: query.priority } : {},
        query.assignedUserId ? { assignedUserId: query.assignedUserId } : {},
        from || to
          ? {
              dueAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {},
      ],
    };
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 50));
    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: this.include,
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);
    return {
      data: data.map((task) => this.visibleRelatedRecords(task, user)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const scope = this.requireScope(user, 'read');
    const task = await this.prisma.task.findFirst({
      where: { id, deletedAt: null, ...this.scopeWhere(user, scope) },
      include: this.include,
    });
    if (!task) throw new NotFoundException('Tâche introuvable.');
    return this.visibleRelatedRecords(task, user);
  }

  async create(dto: CreateTaskDto, user: AuthenticatedUser, context: RequestContext) {
    const scope = this.requireScope(user, 'create');
    const assignedUserId = dto.assignedUserId === undefined ? user.id : dto.assignedUserId;
    if (assignedUserId) await this.assertAssignee(assignedUserId, user, scope);
    const status = dto.status ?? TaskStatus.TODO;
    const task = await this.prisma.$transaction(async (tx) => {
      await this.assertLinks(tx, user, dto);
      const created = await tx.task.create({
        data: {
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          status,
          priority: dto.priority,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          completedAt: status === TaskStatus.DONE ? new Date() : null,
          assignedUserId,
          createdByUserId: user.id,
          opportunityId: dto.opportunityId ?? null,
          organizationId: dto.organizationId ?? null,
          contactId: dto.contactId ?? null,
          quoteId: dto.quoteId ?? null,
        } satisfies Prisma.TaskUncheckedCreateInput,
        include: this.include,
      });
      await this.audit.record({
        action: 'task.created', entityType: 'task', entityId: created.id,
        actorUserId: user.id, ...context,
        metadata: { assignedUserId, dueAt: created.dueAt?.toISOString() ?? null },
      }, tx);
      return created;
    });
    return this.visibleRelatedRecords(task, user);
  }

  async update(id: string, dto: UpdateTaskDto, user: AuthenticatedUser, context: RequestContext) {
    const current = await this.findOneForAction(id, user, 'update');
    const scope = this.requireScope(user, 'update');
    if (dto.assignedUserId) await this.assertAssignee(dto.assignedUserId, user, scope);
    const task = await this.prisma.$transaction(async (tx) => {
      await this.assertLinks(tx, user, dto);
      const nextStatus = dto.status ?? current.status;
      const updated = await tx.task.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          ...(dto.status !== undefined ? {
            status: dto.status,
            completedAt: nextStatus === TaskStatus.DONE ? current.completedAt ?? new Date() : null,
          } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } : {}),
          ...(dto.assignedUserId !== undefined ? { assignedUserId: dto.assignedUserId } : {}),
          ...(dto.opportunityId !== undefined ? { opportunityId: dto.opportunityId } : {}),
          ...(dto.organizationId !== undefined ? { organizationId: dto.organizationId } : {}),
          ...(dto.contactId !== undefined ? { contactId: dto.contactId } : {}),
          ...(dto.quoteId !== undefined ? { quoteId: dto.quoteId } : {}),
        } satisfies Prisma.TaskUncheckedUpdateInput,
        include: this.include,
      });
      await this.audit.record({
        action: 'task.updated', entityType: 'task', entityId: id,
        actorUserId: user.id, ...context,
        metadata: { changedFields: Object.keys(dto) },
      }, tx);
      return updated;
    });
    return this.visibleRelatedRecords(task, user);
  }

  async remove(id: string, user: AuthenticatedUser, context: RequestContext): Promise<void> {
    await this.findOneForAction(id, user, 'delete');
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record({
        action: 'task.deleted', entityType: 'task', entityId: id,
        actorUserId: user.id, ...context,
      }, tx);
    });
  }

  private async findOneForAction(id: string, user: AuthenticatedUser, action: string) {
    const scope = this.requireScope(user, action);
    const task = await this.prisma.task.findFirst({
      where: { id, deletedAt: null, ...this.scopeWhere(user, scope) },
    });
    if (!task) throw new NotFoundException('Tâche introuvable.');
    return task;
  }
}
