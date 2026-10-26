import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractStatus, PermissionScope, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser, RequestContext } from '../auth/auth.types';
import { effectiveScope } from '../auth/rbac';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import {
  CreateContractDto,
  ListContractsDto,
  UpdateContractDto,
} from './dto/support.dto';

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly integrations: IntegrationsService,
  ) {}

  private requireScope(
    user: AuthenticatedUser,
    action: string,
  ): PermissionScope {
    const scope = effectiveScope(user, 'contract', action);
    if (!scope) throw new ForbiddenException('Accès refusé');
    return scope;
  }

  private scopeWhere(
    user: AuthenticatedUser,
    scope: PermissionScope,
  ): Prisma.ContractWhereInput {
    if (scope === PermissionScope.ALL) return {};
    if (scope === PermissionScope.OWN) return { createdByUserId: user.id };
    return {
      OR: [
        { createdByUserId: user.id },
        ...(user.teamId
          ? [{ createdBy: { is: { teamId: user.teamId } } }]
          : []),
      ],
    };
  }

  private validateDates(startsAt: Date, expiresAt: Date): void {
    if (expiresAt <= startsAt) {
      throw new BadRequestException(
        'La date de fin doit suivre la date de début.',
      );
    }
  }

  private readonly include = {
    organization: { select: { id: true, name: true, isClient: true } },
    createdBy: { select: { id: true, firstName: true, lastName: true } },
  } satisfies Prisma.ContractInclude;

  async findAll(query: ListContractsDto, user: AuthenticatedUser) {
    const scope = this.requireScope(user, 'read');
    const now = new Date();
    const expiringBefore = query.expiringWithinDays
      ? new Date(now.getTime() + query.expiringWithinDays * 86_400_000)
      : undefined;
    const expiresBefore = query.expiresBefore
      ? new Date(query.expiresBefore)
      : undefined;
    const expiresAfter = query.expiresAfter
      ? new Date(query.expiresAfter)
      : undefined;
    if (expiresBefore && expiresAfter && expiresBefore < expiresAfter) {
      throw new BadRequestException(
        'La borne de début doit précéder la borne de fin.',
      );
    }
    const where: Prisma.ContractWhereInput = {
      deletedAt: null,
      AND: [
        this.scopeWhere(user, scope),
        query.status ? { status: query.status } : {},
        query.organizationId ? { organizationId: query.organizationId } : {},
        expiresBefore ? { expiresAt: { lte: expiresBefore } } : {},
        expiresAfter ? { expiresAt: { gte: expiresAfter } } : {},
        expiringBefore
          ? {
              expiresAt: { gte: now, lte: expiringBefore },
              status: ContractStatus.ACTIVE,
            }
          : {},
      ],
    };
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 30));
    const [data, total] = await this.prisma.$transaction([
      this.prisma.contract.findMany({
        where,
        include: this.include,
        orderBy: [{ expiresAt: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contract.count({ where }),
    ]);
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const scope = this.requireScope(user, 'read');
    const contract = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null, ...this.scopeWhere(user, scope) },
      include: this.include,
    });
    if (!contract) throw new NotFoundException('Contrat introuvable.');
    return contract;
  }

  async create(
    dto: CreateContractDto,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    this.requireScope(user, 'create');
    if (!effectiveScope(user, 'organization', 'read')) {
      throw new ForbiddenException('Vous ne pouvez pas lier une organisation.');
    }
    const startsAt = new Date(dto.startsAt);
    const expiresAt = new Date(dto.expiresAt);
    this.validateDates(startsAt, expiresAt);
    const number = this.generateNumber();
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findFirst({
        where: { id: dto.organizationId, deletedAt: null, isClient: true },
        select: { id: true },
      });
      if (!organization) {
        throw new BadRequestException(
          'Le contrat doit être lié à un client actif.',
        );
      }
      const contract = await tx.contract.create({
        data: {
          number,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          value: dto.value,
          currency: dto.currency ?? 'XOF',
          startsAt,
          expiresAt,
          organizationId: dto.organizationId,
          createdByUserId: user.id,
        },
        include: this.include,
      });
      await this.audit.record(
        {
          action: 'contract.created',
          entityType: 'contract',
          entityId: contract.id,
          actorUserId: user.id,
          ...context,
          metadata: {
            number: contract.number,
            organizationId: contract.organizationId,
            expiresAt: contract.expiresAt.toISOString(),
          },
        },
        tx,
      );
      await this.integrations.enqueue(
        'contract.created',
        'contract',
        contract.id,
        { number: contract.number, organizationId: contract.organizationId },
        `contract.created:${contract.id}`,
        tx,
      );
      return contract;
    });
  }

  async update(
    id: string,
    dto: UpdateContractDto,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    const current = await this.findOneForAction(id, user, 'update');
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt;
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : current.expiresAt;
    this.validateDates(startsAt, expiresAt);
    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.value !== undefined ? { value: dto.value } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          ...(dto.startsAt !== undefined ? { startsAt } : {}),
          ...(dto.expiresAt !== undefined ? { expiresAt } : {}),
          ...(dto.status !== undefined
            ? { status: dto.status as ContractStatus }
            : {}),
        },
        include: this.include,
      });
      await this.audit.record(
        {
          action: 'contract.updated',
          entityType: 'contract',
          entityId: id,
          actorUserId: user.id,
          ...context,
          metadata: { changedFields: Object.keys(dto) },
        },
        tx,
      );
      return contract;
    });
  }

  async remove(id: string, user: AuthenticatedUser, context: RequestContext) {
    await this.findOneForAction(id, user, 'delete');
    await this.prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'contract.archived',
          entityType: 'contract',
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
    const contract = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null, ...this.scopeWhere(user, scope) },
      select: { id: true, startsAt: true, expiresAt: true },
    });
    if (!contract) throw new NotFoundException('Contrat introuvable.');
    return contract;
  }

  private generateNumber(): string {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `CTR-${date}-${suffix}`;
  }
}
