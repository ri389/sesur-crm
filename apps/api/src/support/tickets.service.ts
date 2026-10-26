import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  PermissionScope,
  Prisma,
  TicketPriority,
  TicketStatus,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser, RequestContext } from '../auth/auth.types';
import { effectiveScope } from '../auth/rbac';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import {
  CreateTicketCommentDto,
  CreateTicketDto,
  ListTicketsDto,
  UpdateTicketDto,
} from './dto/support.dto';

const TERMINAL_STATUSES = [TicketStatus.RESOLVED, TicketStatus.CLOSED];

@Injectable()
export class TicketsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketsService.name);
  private escalationTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly integrations: IntegrationsService,
  ) {}

  onModuleInit(): void {
    this.escalationTimer = setInterval(() => {
      void this.escalateOverdueTickets().catch((error: unknown) => {
        this.logger.error('Échec du traitement automatique des SLA.', error);
      });
    }, 60_000);
    this.escalationTimer.unref();
    void this.escalateOverdueTickets().catch((error: unknown) => {
      this.logger.error('Échec du traitement initial des SLA.', error);
    });
  }

  onModuleDestroy(): void {
    if (this.escalationTimer) clearInterval(this.escalationTimer);
  }

  private slaHours(priority: TicketPriority): {
    response: number;
    resolution: number;
  } {
    const defaults: Record<
      TicketPriority,
      { response: number; resolution: number }
    > = {
      [TicketPriority.LOW]: { response: 24, resolution: 72 },
      [TicketPriority.NORMAL]: { response: 8, resolution: 48 },
      [TicketPriority.HIGH]: { response: 4, resolution: 24 },
      [TicketPriority.URGENT]: { response: 1, resolution: 8 },
    };
    const configured = defaults[priority];
    const readHours = (key: string, fallback: number) => {
      const value = Number(process.env[key]);
      return Number.isFinite(value) && value > 0 ? value : fallback;
    };
    const prefix = `SLA_${priority}_`;
    return {
      response: readHours(`${prefix}FIRST_RESPONSE_HOURS`, configured.response),
      resolution: readHours(`${prefix}RESOLUTION_HOURS`, configured.resolution),
    };
  }

  private calculateSlaDeadlines(priority: TicketPriority, createdAt: Date) {
    const policy = this.slaHours(priority);
    return {
      slaResponseDueAt: new Date(
        createdAt.getTime() + policy.response * 3_600_000,
      ),
      slaResolutionDueAt: new Date(
        createdAt.getTime() + policy.resolution * 3_600_000,
      ),
    };
  }

  private async escalateOverdueTickets(): Promise<void> {
    const now = new Date();
    const overdue = await this.prisma.ticket.findMany({
      where: {
        deletedAt: null,
        escalatedAt: null,
        slaResolutionDueAt: { lt: now },
        status: { notIn: TERMINAL_STATUSES },
      },
      select: { id: true },
      take: 200,
    });
    for (const ticket of overdue) {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.ticket.updateMany({
          where: {
            id: ticket.id,
            deletedAt: null,
            escalatedAt: null,
            slaResolutionDueAt: { lt: now },
            status: { notIn: TERMINAL_STATUSES },
          },
          data: { escalatedAt: now },
        });
        if (updated.count) {
          await this.audit.record(
            {
              action: 'ticket.auto_escalated',
              entityType: 'ticket',
              entityId: ticket.id,
              metadata: { reason: 'resolution_sla_overdue' },
            },
            tx,
          );
        }
      });
    }
  }

  private requireScope(
    user: AuthenticatedUser,
    action: string,
  ): PermissionScope {
    const scope = effectiveScope(user, 'ticket', action);
    if (!scope) throw new ForbiddenException('Accès refusé');
    return scope;
  }

  private scopeWhere(
    user: AuthenticatedUser,
    scope: PermissionScope,
  ): Prisma.TicketWhereInput {
    if (scope === PermissionScope.ALL) return {};
    return {
      OR: [
        { assignedUserId: user.id },
        { createdByUserId: user.id },
        ...(scope === PermissionScope.TEAM && user.teamId
          ? [{ assignedUser: { is: { teamId: user.teamId } } }]
          : []),
      ],
    };
  }

  private async assertAssignee(
    assigneeId: string,
    user: AuthenticatedUser,
    scope: PermissionScope,
  ): Promise<void> {
    const assignee = await this.prisma.user.findFirst({
      where: { id: assigneeId, isActive: true, deletedAt: null },
      select: { id: true, teamId: true },
    });
    if (!assignee)
      throw new BadRequestException('Agent introuvable ou inactif.');
    if (scope === PermissionScope.OWN && assignee.id !== user.id) {
      throw new ForbiddenException(
        'Vous ne pouvez attribuer ce ticket qu’à vous-même.',
      );
    }
    if (
      scope === PermissionScope.TEAM &&
      assignee.id !== user.id &&
      (!user.teamId || assignee.teamId !== user.teamId)
    ) {
      throw new ForbiddenException('L’agent doit appartenir à votre équipe.');
    }
  }

  private async assertLinks(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    links: Pick<CreateTicketDto, 'organizationId' | 'contactId'>,
  ): Promise<void> {
    if (links.organizationId) {
      if (!effectiveScope(user, 'organization', 'read')) {
        throw new ForbiddenException(
          'Vous ne pouvez pas lier une organisation.',
        );
      }
      const organization = await tx.organization.findFirst({
        where: { id: links.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!organization)
        throw new NotFoundException('Organisation introuvable.');
    }

    if (links.contactId) {
      if (!effectiveScope(user, 'contact', 'read')) {
        throw new ForbiddenException('Vous ne pouvez pas lier un contact.');
      }
      const contact = await tx.contact.findFirst({
        where: { id: links.contactId, deletedAt: null },
        select: { id: true, organizationId: true },
      });
      if (!contact) throw new NotFoundException('Contact introuvable.');
      if (
        links.organizationId &&
        contact.organizationId &&
        links.organizationId !== contact.organizationId
      ) {
        throw new BadRequestException(
          'Le contact ne dépend pas de l’organisation sélectionnée.',
        );
      }
    }
  }

  private readonly include = {
    assignedUser: { select: { id: true, firstName: true, lastName: true } },
    createdBy: { select: { id: true, firstName: true, lastName: true } },
    organization: { select: { id: true, name: true } },
    contact: { select: { id: true, firstName: true, lastName: true } },
  } satisfies Prisma.TicketInclude;

  async findAll(query: ListTicketsDto, user: AuthenticatedUser) {
    const scope = this.requireScope(user, 'read');
    const now = new Date();
    const activeStatus: Prisma.TicketWhereInput = {
      status: { notIn: TERMINAL_STATUSES },
    };
    const slaFilter: Prisma.TicketWhereInput =
      query.sla === 'OVERDUE'
        ? {
            AND: [
              activeStatus,
              {
                OR: [
                  { slaResponseDueAt: { lt: now } },
                  { slaResolutionDueAt: { lt: now } },
                ],
              },
            ],
          }
        : query.sla === 'ON_TRACK'
          ? {
              AND: [
                activeStatus,
                {
                  OR: [
                    { slaResponseDueAt: { gte: now } },
                    { slaResolutionDueAt: { gte: now } },
                  ],
                },
                {
                  NOT: {
                    OR: [
                      { slaResponseDueAt: { lt: now } },
                      { slaResolutionDueAt: { lt: now } },
                    ],
                  },
                },
              ],
            }
          : query.sla === 'NONE'
            ? { slaResponseDueAt: null, slaResolutionDueAt: null }
            : {};

    const where: Prisma.TicketWhereInput = {
      deletedAt: null,
      AND: [
        this.scopeWhere(user, scope),
        query.status ? { status: query.status } : {},
        query.priority ? { priority: query.priority } : {},
        query.assignedUserId ? { assignedUserId: query.assignedUserId } : {},
        query.organizationId ? { organizationId: query.organizationId } : {},
        query.search?.trim()
          ? {
              OR: [
                {
                  number: {
                    contains: query.search.trim(),
                    mode: 'insensitive',
                  },
                },
                {
                  title: { contains: query.search.trim(), mode: 'insensitive' },
                },
                {
                  description: {
                    contains: query.search.trim(),
                    mode: 'insensitive',
                  },
                },
                {
                  organization: {
                    is: {
                      name: {
                        contains: query.search.trim(),
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              ],
            }
          : {},
        query.escalated === undefined
          ? {}
          : query.escalated
            ? { escalatedAt: { not: null } }
            : { escalatedAt: null },
        slaFilter,
      ],
    };
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 30));
    const [data, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        include: this.include,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const scope = this.requireScope(user, 'read');
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, deletedAt: null, ...this.scopeWhere(user, scope) },
      include: {
        ...this.include,
        comments: {
          orderBy: { createdAt: 'asc' },
          take: 200,
          include: {
            author: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket introuvable.');
    const history = await this.prisma.auditLog.findMany({
      where: { entityType: 'ticket', entityId: id },
      orderBy: { occurredAt: 'desc' },
      take: 100,
      include: {
        actor: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return { ...ticket, history };
  }

  async create(
    dto: CreateTicketDto,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    const scope = this.requireScope(user, 'create');
    const assignedUserId =
      dto.assignedUserId === undefined ? user.id : dto.assignedUserId;
    if (assignedUserId) await this.assertAssignee(assignedUserId, user, scope);
    const number = this.generateNumber('SAV');
    const createdAt = new Date();
    const priority = dto.priority ?? TicketPriority.NORMAL;
    const defaultDeadlines = this.calculateSlaDeadlines(priority, createdAt);
    const ticket = await this.prisma.$transaction(async (tx) => {
      await this.assertLinks(tx, user, dto);
      const created = await tx.ticket.create({
        data: {
          number,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          priority,
          slaResponseDueAt: dto.slaResponseDueAt
            ? new Date(dto.slaResponseDueAt)
            : dto.slaResponseDueAt === null
              ? null
              : defaultDeadlines.slaResponseDueAt,
          slaResolutionDueAt: dto.slaResolutionDueAt
            ? new Date(dto.slaResolutionDueAt)
            : dto.slaResolutionDueAt === null
              ? null
              : defaultDeadlines.slaResolutionDueAt,
          assignedUserId,
          createdByUserId: user.id,
          organizationId: dto.organizationId ?? null,
          contactId: dto.contactId ?? null,
        },
        include: this.include,
      });
      await this.audit.record(
        {
          action: 'ticket.created',
          entityType: 'ticket',
          entityId: created.id,
          actorUserId: user.id,
          ...context,
          metadata: { number: created.number, priority: created.priority },
        },
        tx,
      );
      await this.integrations.enqueue(
        'ticket.created',
        'ticket',
        created.id,
        { number: created.number, priority: created.priority },
        `ticket.created:${created.id}`,
        tx,
      );
      return created;
    });
    return ticket;
  }

  async update(
    id: string,
    dto: UpdateTicketDto,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    const current = await this.findOneForAction(id, user, 'update');
    const scope = this.requireScope(user, 'update');
    if (dto.assignedUserId) {
      await this.assertAssignee(dto.assignedUserId, user, scope);
    }
    const ticket = await this.prisma.$transaction(async (tx) => {
      await this.assertLinks(tx, user, dto);
      const nextStatus = dto.status ?? current.status;
      const isResolved =
        nextStatus === TicketStatus.RESOLVED ||
        nextStatus === TicketStatus.CLOSED;
      const updated = await tx.ticket.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.status !== undefined
            ? {
                status: dto.status,
                resolvedAt: isResolved
                  ? (current.resolvedAt ?? new Date())
                  : null,
                closedAt:
                  nextStatus === TicketStatus.CLOSED
                    ? (current.closedAt ?? new Date())
                    : null,
              }
            : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.slaResponseDueAt !== undefined
            ? {
                slaResponseDueAt: dto.slaResponseDueAt
                  ? new Date(dto.slaResponseDueAt)
                  : null,
              }
            : {}),
          ...(dto.slaResolutionDueAt !== undefined
            ? {
                slaResolutionDueAt: dto.slaResolutionDueAt
                  ? new Date(dto.slaResolutionDueAt)
                  : null,
              }
            : {}),
          ...(dto.assignedUserId !== undefined
            ? { assignedUserId: dto.assignedUserId }
            : {}),
          ...(dto.organizationId !== undefined
            ? { organizationId: dto.organizationId }
            : {}),
          ...(dto.contactId !== undefined ? { contactId: dto.contactId } : {}),
        },
        include: this.include,
      });
      await this.audit.record(
        {
          action: 'ticket.updated',
          entityType: 'ticket',
          entityId: id,
          actorUserId: user.id,
          ...context,
          metadata: {
            changedFields: Object.keys(dto),
            status: updated.status,
            priority: updated.priority,
          },
        },
        tx,
      );
      return updated;
    });
    return ticket;
  }

  async addComment(
    id: string,
    dto: CreateTicketCommentDto,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.findOneForAction(id, user, 'comment');
    const body = dto.body.trim();
    if (!body)
      throw new BadRequestException('Le commentaire ne peut pas être vide.');
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.ticketComment.create({
        data: { ticketId: id, authorUserId: user.id, body },
        include: {
          author: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      await this.audit.record(
        {
          action: 'ticket.comment_added',
          entityType: 'ticket',
          entityId: id,
          actorUserId: user.id,
          ...context,
          metadata: { commentId: comment.id },
        },
        tx,
      );
      return comment;
    });
  }

  async setEscalated(
    id: string,
    escalated: boolean,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.findOneForAction(id, user, 'escalate');
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.update({
        where: { id },
        data: { escalatedAt: escalated ? new Date() : null },
        include: this.include,
      });
      await this.audit.record(
        {
          action: escalated ? 'ticket.escalated' : 'ticket.escalation_cleared',
          entityType: 'ticket',
          entityId: id,
          actorUserId: user.id,
          ...context,
        },
        tx,
      );
      return ticket;
    });
  }

  async remove(id: string, user: AuthenticatedUser, context: RequestContext) {
    await this.findOneForAction(id, user, 'delete');
    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'ticket.archived',
          entityType: 'ticket',
          entityId: id,
          actorUserId: user.id,
          ...context,
        },
        tx,
      );
    });
  }

  private async findOneForAction(
    id: string,
    user: AuthenticatedUser,
    action: string,
  ) {
    const scope = this.requireScope(user, action);
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, deletedAt: null, ...this.scopeWhere(user, scope) },
      select: {
        id: true,
        status: true,
        resolvedAt: true,
        closedAt: true,
      },
    });
    if (!ticket) throw new NotFoundException('Ticket introuvable.');
    return ticket;
  }

  private generateNumber(prefix: 'SAV'): string {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-${date}-${suffix}`;
  }
}
