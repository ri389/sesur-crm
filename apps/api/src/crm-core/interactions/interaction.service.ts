import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Interaction, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInteractionDto } from './dto/interaction.dto';

@Injectable()
export class InteractionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(params: {
    leadId?: string;
    contactId?: string;
    organizationId?: string;
  }): Promise<Interaction[]> {
    const where: Prisma.InteractionWhereInput = {
      ...(params.leadId ? { leadId: params.leadId } : {}),
      ...(params.contactId ? { contactId: params.contactId } : {}),
      ...(params.organizationId ? { organizationId: params.organizationId } : {}),
    };
    return this.prisma.interaction.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      take: 200,
    });
  }

  async create(
    dto: CreateInteractionDto,
    actorUserId: string,
  ): Promise<Interaction> {
    if (!dto.leadId && !dto.contactId && !dto.organizationId) {
      throw new BadRequestException(
        'Rattachez l’interaction à un prospect, un contact ou une organisation.',
      );
    }
    const interaction = await this.prisma.interaction.create({
      data: {
        channel: dto.channel,
        direction: dto.direction,
        summary: dto.summary.trim(),
        userId: actorUserId,
        leadId: dto.leadId || null,
        contactId: dto.contactId || null,
        organizationId: dto.organizationId || null,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    await this.audit.record({
      action: 'interaction.created',
      entityType: 'interaction',
      entityId: interaction.id,
      actorUserId,
      metadata: { channel: dto.channel },
    });
    return interaction;
  }

  async delete(id: string, actorUserId: string): Promise<void> {
    const existing = await this.prisma.interaction.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Interaction introuvable');
    }
    await this.prisma.interaction.delete({ where: { id } });
    await this.audit.record({
      action: 'interaction.deleted',
      entityType: 'interaction',
      entityId: id,
      actorUserId,
    });
  }
}
