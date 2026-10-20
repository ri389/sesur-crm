import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamDto, UpdateTeamDto } from './dto/user.dto';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.team.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { members: true } },
      },
    });
  }

  async create(dto: CreateTeamDto, actorUserId: string) {
    const team = await this.prisma.team.create({
      data: { name: dto.name.trim(), managerId: dto.managerId || null },
    });
    await this.audit.record({
      action: 'team.created',
      entityType: 'team',
      entityId: team.id,
      actorUserId,
    });
    return team;
  }

  async update(id: string, dto: UpdateTeamDto, actorUserId: string) {
    const existing = await this.prisma.team.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Équipe introuvable');
    const team = await this.prisma.team.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
      },
    });
    await this.audit.record({
      action: 'team.updated',
      entityType: 'team',
      entityId: id,
      actorUserId,
    });
    return team;
  }
}
