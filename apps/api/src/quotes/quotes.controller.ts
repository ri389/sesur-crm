
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateQuoteDto, UpdateQuoteDto } from './dto/quote.dto';
import { QuotesService } from './quotes.service';

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @RequirePermission('quote', 'create')
  create(
    @Body() dto: CreateQuoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotesService.create(dto, user.id);
  }

  @Get()
  @RequirePermission('quote', 'read')
  findAll() {
    return this.quotesService.findAll();
  }

  @Get(':id')
  @RequirePermission('quote', 'read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('quote', 'update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotesService.update(id, dto, user.id);
  }
}
