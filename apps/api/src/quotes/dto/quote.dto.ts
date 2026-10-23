import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { QuoteStatus } from '@prisma/client';

export class QuoteItemDto {
  @IsUUID()
  productId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discount?: number;
}

export class CreateQuoteDto {
  @IsUUID()
  organizationId!: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items!: QuoteItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  globalDiscount?: number;
}

export class UpdateQuoteDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items?: QuoteItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  globalDiscount?: number;
}

export class QuoteResponseDto {
  id!: string;
  quoteNumber!: string;
  organizationId!: string;
  contactId?: string | null;
  status!: QuoteStatus;

  items!: {
    productId: string | null;
    productName: string;
    unitPrice: number;
    quantity: number;
    discount: number;
    totalLine: number;
  }[];

  subTotal!: number;
  totalDiscount!: number;
  taxAmount!: number;
  totalTTC!: number;

  createdAt!: Date;
  updatedAt!: Date;
  createdBy!: string;
}
