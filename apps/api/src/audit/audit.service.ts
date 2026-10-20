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

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({ data: entry });
  }

  list(params: { action?: string; entityType?: string }) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(params.action ? { action: { contains: params.action } } : {}),
        ...(params.entityType ? { entityType: params.entityType } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: 150,
      include: {
        actor: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }
}
