import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, QuoteStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateQuoteDto,
  QuoteItemDto,
  QuoteResponseDto,
  UpdateQuoteDto,
} from './dto/quote.dto';

type Decimal = Prisma.Decimal;

type PreparedQuoteItem = {
  productId: string;
  productSku: string;
  productName: string;
  quantity: Decimal;
  unitPrice: Decimal;
  discountRate: Decimal;
  lineSubtotal: Decimal;
  lineDiscountAmount: Decimal;
  lineTaxAmount: Decimal;
  lineTotal: Decimal;
};

type QuoteItemForTotals = {
  lineSubtotal: Decimal;
  lineDiscountAmount: Decimal;
};

@Injectable()
export class QuotesService {
  private readonly taxRate = new Prisma.Decimal('0.18');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreateQuoteDto,
    userId: string,
  ): Promise<QuoteResponseDto> {
    const quoteNumber = this.generateQuoteNumber();

    const quote = await this.prisma.$transaction(async (tx) => {
      await this.assertOrganizationAndContact(
        tx,
        dto.organizationId,
        dto.contactId,
      );

      const items = await this.prepareItems(tx, dto.items);
      const totals = this.calculateTotals(
        items,
        dto.globalDiscount ?? 0,
      );

      return tx.quote.create({
        data: {
          number: quoteNumber,
          status: QuoteStatus.DRAFT,
          organizationId: dto.organizationId,
          contactId: dto.contactId ?? null,
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxAmount: totals.taxAmount,
          total: totals.total,
          createdByUserId: userId,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              productSku: item.productSku,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountRate: item.discountRate,
              taxRate: new Prisma.Decimal(18),
              lineSubtotal: item.lineSubtotal,
              lineDiscountAmount: item.lineDiscountAmount,
              lineTaxAmount: item.lineTaxAmount,
              lineTotal: item.lineTotal,
            })),
          },
        },
        include: { items: true },
      });
    });

    await this.audit.record({
      action: 'quote.created',
      entityType: 'quote',
      entityId: quote.id,
      actorUserId: userId,
    });

    return this.mapToResponse(quote);
  }

  async update(
    id: string,
    dto: UpdateQuoteDto,
    userId: string,
  ): Promise<QuoteResponseDto> {
    const quote = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.quote.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existing || existing.deletedAt) {
        throw new NotFoundException('Devis non trouvé.');
      }

      if (existing.status !== QuoteStatus.DRAFT) {
        throw new ForbiddenException(
          'Seuls les devis en brouillon peuvent être modifiés.',
        );
      }

      const items: QuoteItemForTotals[] = dto.items
        ? await this.prepareItems(tx, dto.items)
        : existing.items;

      const currentGlobalDiscount = this.getGlobalDiscountRate(
        existing.subtotal,
        existing.discountAmount,
        existing.items,
      );

      const globalDiscount =
        dto.globalDiscount ?? currentGlobalDiscount;

      const totals = this.calculateTotals(items, globalDiscount);

      if (dto.items) {
        await tx.quoteItem.deleteMany({
          where: { quoteId: id },
        });

        await tx.quoteItem.createMany({
          data: (items as PreparedQuoteItem[]).map((item) => ({
            quoteId: id,
            productId: item.productId,
            productSku: item.productSku,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountRate: item.discountRate,
            taxRate: new Prisma.Decimal(18),
            lineSubtotal: item.lineSubtotal,
            lineDiscountAmount: item.lineDiscountAmount,
            lineTaxAmount: item.lineTaxAmount,
            lineTotal: item.lineTotal,
          })),
        });
      }

      return tx.quote.update({
        where: { id },
        data: {
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxAmount: totals.taxAmount,
          total: totals.total,
        },
        include: { items: true },
      });
    });

    await this.audit.record({
      action: 'quote.updated',
      entityType: 'quote',
      entityId: id,
      actorUserId: userId,
    });

    return this.mapToResponse(quote);
  }

  async findOne(id: string): Promise<QuoteResponseDto> {
    const quote = await this.prisma.quote.findFirst({
      where: { id, deletedAt: null },
      include: { items: true },
    });

    if (!quote) {
      throw new NotFoundException('Devis non trouvé.');
    }

    return this.mapToResponse(quote);
  }

  async findAll(): Promise<QuoteResponseDto[]> {
    const quotes = await this.prisma.quote.findMany({
      where: { deletedAt: null },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return quotes.map((quote) => this.mapToResponse(quote));
  }

  private generateQuoteNumber(): string {
    const year = new Date().getFullYear();
    const uniquePart = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();

    return `DEV-${year}-${uniquePart}`;
  }

  private async assertOrganizationAndContact(
    tx: Prisma.TransactionClient,
    organizationId: string,
    contactId?: string,
  ): Promise<void> {
    const organization = await tx.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!organization) {
      throw new NotFoundException('Organisation introuvable.');
    }

    if (contactId) {
      const contact = await tx.contact.findFirst({
        where: {
          id: contactId,
          deletedAt: null,
          organizationId,
        },
        select: { id: true },
      });

      if (!contact) {
        throw new BadRequestException(
          "Le contact indiqué n'appartient pas à cette organisation ou n'existe pas.",
        );
      }
    }
  }

  private async prepareItems(
    tx: Prisma.TransactionClient,
    itemsDto: QuoteItemDto[],
  ): Promise<PreparedQuoteItem[]> {
    const processed: PreparedQuoteItem[] = [];

    for (const item of itemsDto) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
      });

      if (!product) {
        throw new NotFoundException(
          `Produit introuvable : ${item.productId}.`,
        );
      }

      if (product.status !== 'ACTIVE') {
        throw new BadRequestException(
          `Le produit "${product.name}" n'est pas actif.`,
        );
      }

      const unitPrice = new Prisma.Decimal(product.unitPrice);
      const quantity = new Prisma.Decimal(item.quantity);
      const discountRate = new Prisma.Decimal(item.discount ?? 0);

      const lineSubtotal = this.money(unitPrice.mul(quantity));
      const lineDiscountAmount = this.money(
        lineSubtotal.mul(discountRate).div(100),
      );

      const taxableLine = lineSubtotal.sub(lineDiscountAmount);
      const lineTaxAmount = this.money(taxableLine.mul(this.taxRate));
      const lineTotal = this.money(taxableLine.add(lineTaxAmount));

      processed.push({
        productId: product.id,
        productSku: product.sku,
        productName: product.name,
        quantity,
        unitPrice,
        discountRate,
        lineSubtotal,
        lineDiscountAmount,
        lineTaxAmount,
        lineTotal,
      });
    }

    return processed;
  }

  private calculateTotals(
    items: QuoteItemForTotals[],
    globalDiscountRate: number,
  ) {
    const subtotal = this.money(
      items.reduce(
        (sum, item) => sum.add(item.lineSubtotal),
        new Prisma.Decimal(0),
      ),
    );

    const lineDiscountTotal = this.money(
      items.reduce(
        (sum, item) => sum.add(item.lineDiscountAmount),
        new Prisma.Decimal(0),
      ),
    );

    const amountAfterLineDiscounts = subtotal.sub(lineDiscountTotal);

    const globalDiscountAmount = this.money(
      amountAfterLineDiscounts
        .mul(globalDiscountRate)
        .div(100),
    );

    const discountAmount = this.money(
      lineDiscountTotal.add(globalDiscountAmount),
    );

    const taxableAmount = subtotal.sub(discountAmount);
    const taxAmount = this.money(taxableAmount.mul(this.taxRate));
    const total = this.money(taxableAmount.add(taxAmount));

    return {
      subtotal,
      discountAmount,
      taxAmount,
      total,
    };
  }

  private getGlobalDiscountRate(
    subtotal: Decimal,
    totalDiscount: Decimal,
    items: QuoteItemForTotals[],
  ): number {
    const lineDiscountTotal = items.reduce(
      (sum, item) => sum.add(item.lineDiscountAmount),
      new Prisma.Decimal(0),
    );

    const amountAfterLineDiscounts = subtotal.sub(lineDiscountTotal);

    if (amountAfterLineDiscounts.lte(0)) {
      return 0;
    }

    const globalDiscountAmount = totalDiscount.sub(lineDiscountTotal);

    return globalDiscountAmount
      .mul(100)
      .div(amountAfterLineDiscounts)
      .toNumber();
  }

  private money(value: Decimal): Decimal {
    return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }

  private mapToResponse(quote: {
    id: string;
    number: string;
    organizationId: string | null;
    contactId: string | null;
    status: QuoteStatus;
    subtotal: Decimal;
    discountAmount: Decimal;
    taxAmount: Decimal;
    total: Decimal;
    createdAt: Date;
    updatedAt: Date;
    createdByUserId: string;
    items: Array<{
      productId: string | null;
      productName: string;
      unitPrice: Decimal;
      quantity: Decimal;
      discountRate: Decimal;
      lineTotal: Decimal;
    }>;
  }): QuoteResponseDto {
    return {
      id: quote.id,
      quoteNumber: quote.number,
      organizationId: quote.organizationId ?? '',
      contactId: quote.contactId,
      status: quote.status,
      items: quote.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        unitPrice: item.unitPrice.toNumber(),
        quantity: item.quantity.toNumber(),
        discount: item.discountRate.toNumber(),
        totalLine: item.lineTotal.toNumber(),
      })),
      subTotal: quote.subtotal.toNumber(),
      totalDiscount: quote.discountAmount.toNumber(),
      taxAmount: quote.taxAmount.toNumber(),
      totalTTC: quote.total.toNumber(),
      createdAt: quote.createdAt,
      updatedAt: quote.updatedAt,
      createdBy: quote.createdByUserId,
    };
  }
}
