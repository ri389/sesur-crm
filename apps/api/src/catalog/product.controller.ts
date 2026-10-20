import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { ProductService } from './product.service';

@Controller('products')
export class ProductController {
  constructor(private readonly products: ProductService) {}

  @Get()
  @RequirePermission('product', 'read')
  list() {
    return this.products.list();
  }

  @Get(':id')
  @RequirePermission('product', 'read')
  findById(@Param('id') id: string) {
    return this.products.findById(id);
  }

  @Post()
  @RequirePermission('product', 'create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthenticatedUser) {
    return this.products.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('product', 'update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.update(id, dto, user.id);
  }
}
