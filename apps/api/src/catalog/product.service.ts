import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.product.findMany({ orderBy: { name: 'asc' } });
  }

  async findById(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Produit introuvable');
    return product;
  }

  async create(dto: CreateProductDto, actorUserId: string) {
    try {
      const product = await this.prisma.product.create({
        data: {
          sku: dto.sku.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          unitPrice: new Prisma.Decimal(dto.unitPrice),
          status: dto.status,
        },
      });
      await this.audit.record({
        action: 'product.created',
        entityType: 'product',
        entityId: product.id,
        actorUserId,
      });
      return product;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Cette référence (SKU) existe déjà.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateProductDto, actorUserId: string) {
    await this.findById(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.sku !== undefined ? { sku: dto.sku.trim().toUpperCase() } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.unitPrice !== undefined
          ? { unitPrice: new Prisma.Decimal(dto.unitPrice) }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    await this.audit.record({
      action: 'product.updated',
      entityType: 'product',
      entityId: id,
      actorUserId,
    });
    return product;
  }
}
