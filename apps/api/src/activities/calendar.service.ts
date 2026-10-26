import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PermissionScope, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser, RequestContext } from '../auth/auth.types';
import { effectiveScope } from '../auth/rbac';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCalendarEventDto,
  ListCalendarEventsDto,
  UpdateCalendarEventDto,
} from './dto/activity.dto';

type CalendarRelatedRecords = {
  opportunity: {
    id: string;
    name: string;
    ownerUserId: string;
    owner: { teamId: string | null };
  } | null;
  organization: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
};

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private requireScope(user: AuthenticatedUser, action: string): PermissionScope {
    const scope = effectiveScope(user, 'calendar', action);
    if (!scope) throw new ForbiddenException('Accès refusé');
    return scope;
  }

  private scopeWhere(
    user: AuthenticatedUser,
    scope: PermissionScope,
  ): Prisma.CalendarEventWhereInput {
    if (scope === PermissionScope.ALL) return {};
    if (scope === PermissionScope.OWN || !user.teamId) return { ownerUserId: user.id };
    return {
      OR: [
        { ownerUserId: user.id },
        { owner: { is: { teamId: user.teamId } } },
      ],
    };
  }

  private async assertOwner(
    ownerUserId: string,
    user: AuthenticatedUser,
    scope: PermissionScope,
  ): Promise<void> {
    const owner = await this.prisma.user.findFirst({
      where: { id: ownerUserId, isActive: true, deletedAt: null },
      select: { id: true, teamId: true },
    });
    if (!owner) throw new BadRequestException('Responsable introuvable ou inactif.');
    if (scope === PermissionScope.OWN && owner.id !== user.id) {
      throw new ForbiddenException('Vous ne pouvez gérer que votre propre agenda.');
    }
    if (
      scope === PermissionScope.TEAM &&
      owner.id !== user.id &&
      (!user.teamId || owner.teamId !== user.teamId)
    ) {
      throw new ForbiddenException('Le responsable doit appartenir à votre équipe.');
    }
  }

  private async assertLinks(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    links: Pick<CreateCalendarEventDto, 'opportunityId' | 'organizationId' | 'contactId'>,
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
        where: { id: links.organizationId, deletedAt: null }, select: { id: true },
      }))) throw new NotFoundException('Client introuvable.');
    }
    if (links.contactId) {
      if (!effectiveScope(user, 'contact', 'read')) {
        throw new ForbiddenException('Vous ne pouvez pas lier un contact.');
      }
      if (!(await tx.contact.findFirst({
        where: { id: links.contactId, deletedAt: null }, select: { id: true },
      }))) throw new NotFoundException('Contact introuvable.');
    }
  }

  private readonly include = {
    owner: { select: { id: true, firstName: true, lastName: true } },
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
  } satisfies Prisma.CalendarEventInclude;

  private canReadOpportunityLink(
    opportunity: NonNullable<CalendarRelatedRecords['opportunity']>,
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

  private visibleRelatedRecords<T extends CalendarRelatedRecords>(
    event: T,
    user: AuthenticatedUser,
  ) {
    const { opportunity, organization, contact, ...fields } = event;
    return {
      ...fields,
      opportunity: opportunity && this.canReadOpportunityLink(opportunity, user)
        ? { id: opportunity.id, name: opportunity.name }
        : null,
      organization: effectiveScope(user, 'organization', 'read') ? organization : null,
      contact: effectiveScope(user, 'contact', 'read') ? contact : null,
    };
  }

  async findAll(query: ListCalendarEventsDto, user: AuthenticatedUser) {
    const scope = this.requireScope(user, 'read');
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('La date de début doit précéder la date de fin.');
    }
    if (from && to && to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('La période de l’agenda ne peut pas dépasser un an.');
    }
    const where: Prisma.CalendarEventWhereInput = {
      deletedAt: null,
      AND: [
        this.scopeWhere(user, scope),
        query.status ? { status: query.status } : {},
        query.type ? { type: query.type } : {},
        query.ownerUserId ? { ownerUserId: query.ownerUserId } : {},
        from || to
          ? {
              ...(from ? { endAt: { gte: from } } : {}),
              ...(to ? { startAt: { lte: to } } : {}),
            }
          : {},
      ],
    };
    const events = await this.prisma.calendarEvent.findMany({
      where,
      include: this.include,
      orderBy: { startAt: 'asc' },
      take: 300,
    });
    return events.map((event) => this.visibleRelatedRecords(event, user));
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const scope = this.requireScope(user, 'read');
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id, deletedAt: null, ...this.scopeWhere(user, scope) },
      include: this.include,
    });
    if (!event) throw new NotFoundException('Événement introuvable.');
    return this.visibleRelatedRecords(event, user);
  }

  async create(dto: CreateCalendarEventDto, user: AuthenticatedUser, context: RequestContext) {
    const scope = this.requireScope(user, 'create');
    const ownerUserId = dto.ownerUserId ?? user.id;
    await this.assertOwner(ownerUserId, user, scope);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) throw new BadRequestException('La fin doit être postérieure au début.');
    const event = await this.prisma.$transaction(async (tx) => {
      await this.assertLinks(tx, user, dto);
      const event = await tx.calendarEvent.create({
        data: {
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          type: dto.type,
          startAt,
          endAt,
          allDay: dto.allDay ?? false,
          ownerUserId,
          createdByUserId: user.id,
          opportunityId: dto.opportunityId ?? null,
          organizationId: dto.organizationId ?? null,
          contactId: dto.contactId ?? null,
        } satisfies Prisma.CalendarEventUncheckedCreateInput,
        include: this.include,
      });
      await this.audit.record({
        action: 'calendar_event.created', entityType: 'calendar_event', entityId: event.id,
        actorUserId: user.id, ...context,
        metadata: { type: event.type, startAt: event.startAt.toISOString(), ownerUserId },
      }, tx);
      return event;
    });
    return this.visibleRelatedRecords(event, user);
  }

  async update(id: string, dto: UpdateCalendarEventDto, user: AuthenticatedUser, context: RequestContext) {
    const current = await this.findOneForAction(id, user, 'update');
    const scope = this.requireScope(user, 'update');
    if (dto.ownerUserId) await this.assertOwner(dto.ownerUserId, user, scope);
    const startAt = dto.startAt !== undefined ? new Date(dto.startAt) : current.startAt;
    const endAt = dto.endAt !== undefined ? new Date(dto.endAt) : current.endAt;
    if (endAt <= startAt) throw new BadRequestException('La fin doit être postérieure au début.');
    const event = await this.prisma.$transaction(async (tx) => {
      await this.assertLinks(tx, user, dto);
      const event = await tx.calendarEvent.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.startAt !== undefined ? { startAt } : {}),
          ...(dto.endAt !== undefined ? { endAt } : {}),
          ...(dto.allDay !== undefined ? { allDay: dto.allDay } : {}),
          ...(dto.ownerUserId !== undefined ? { ownerUserId: dto.ownerUserId } : {}),
          ...(dto.opportunityId !== undefined ? { opportunityId: dto.opportunityId } : {}),
          ...(dto.organizationId !== undefined ? { organizationId: dto.organizationId } : {}),
          ...(dto.contactId !== undefined ? { contactId: dto.contactId } : {}),
        } satisfies Prisma.CalendarEventUncheckedUpdateInput,
        include: this.include,
      });
      await this.audit.record({
        action: 'calendar_event.updated', entityType: 'calendar_event', entityId: id,
        actorUserId: user.id, ...context,
        metadata: { changedFields: Object.keys(dto) },
      }, tx);
      return event;
    });
    return this.visibleRelatedRecords(event, user);
  }

  async remove(id: string, user: AuthenticatedUser, context: RequestContext): Promise<void> {
    await this.findOneForAction(id, user, 'delete');
    await this.prisma.$transaction(async (tx) => {
      await tx.calendarEvent.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record({
        action: 'calendar_event.deleted', entityType: 'calendar_event', entityId: id,
        actorUserId: user.id, ...context,
      }, tx);
    });
  }

  private async findOneForAction(id: string, user: AuthenticatedUser, action: string) {
    const scope = this.requireScope(user, action);
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id, deletedAt: null, ...this.scopeWhere(user, scope) },
    });
    if (!event) throw new NotFoundException('Événement introuvable.');
    return event;
  }
}
