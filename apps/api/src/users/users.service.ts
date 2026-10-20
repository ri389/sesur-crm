import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

const USER_PUBLIC = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  teamId: true,
  managerId: true,
  lastLoginAt: true,
  createdAt: true,
  team: { select: { id: true, name: true } },
  roles: { include: { role: { select: { id: true, code: true, name: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: USER_PUBLIC,
    });
  }

  listRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, description: true, isSystem: true },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_PUBLIC,
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  async create(dto: CreateUserDto, actorUserId: string) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (existing) throw new ConflictException('Cette adresse e-mail est déjà utilisée.');

    let passwordHash: string | null = null;
    if (dto.password) {
      const problems = this.passwords.checkPolicy(dto.password, email);
      if (problems.length > 0) {
        throw new BadRequestException(`Mot de passe refusé : ${problems.join(', ')}`);
      }
      passwordHash = await this.passwords.hash(dto.password);
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        teamId: dto.teamId || null,
        managerId: dto.managerId || null,
        isActive: dto.isActive ?? true,
        passwordHash,
        roles: dto.roleIds?.length
          ? { create: dto.roleIds.map((roleId) => ({ roleId })) }
          : undefined,
      },
      select: USER_PUBLIC,
    });

    await this.audit.record({
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      actorUserId,
    });
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actorUserId: string) {
    await this.findById(id);
    if (dto.roleIds) {
      await this.prisma.userRole.deleteMany({ where: { userId: id } });
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.teamId !== undefined ? { teamId: dto.teamId } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.roleIds
          ? { roles: { create: dto.roleIds.map((roleId) => ({ roleId })) } }
          : {}),
      },
      select: USER_PUBLIC,
    });
    if (dto.isActive === false) {
      await this.prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.record({
      action: 'user.updated',
      entityType: 'user',
      entityId: id,
      actorUserId,
    });
    return user;
  }

  async delete(id: string, actorUserId: string) {
    if (id === actorUserId) {
      throw new BadRequestException('Vous ne pouvez pas supprimer votre propre compte.');
    }
    await this.findById(id);
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, passwordHash: null },
    });
    await this.prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      action: 'user.deleted',
      entityType: 'user',
      entityId: id,
      actorUserId,
    });
  }
}
