import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  actorUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Ne jamais y mettre de mot de passe, jeton ou secret. */
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    entry: AuditEntry,
    transaction?: Prisma.TransactionClient,
  ): Promise<void> {
    if (transaction) {
      await transaction.auditLog.create({ data: entry });
      return;
    }
    await this.prisma.auditLog.create({ data: entry });
  }

  async list(params: { action?: string; entityType?: string }) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(params.action ? { action: { contains: params.action } } : {}),
        ...(params.entityType ? { entityType: params.entityType } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: 150,
    });
    const actorIds = [
      ...new Set(rows.map((row) => row.actorUserId).filter((id): id is string => Boolean(id))),
    ];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];
    const actorsById = new Map(actors.map((actor) => [actor.id, actor]));

    return rows.map((row) => ({
      ...row,
      actor: row.actorUserId ? (actorsById.get(row.actorUserId) ?? null) : null,
    }));
  }
}
