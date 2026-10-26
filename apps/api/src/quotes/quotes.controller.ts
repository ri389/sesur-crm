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
import {
  CreateQuoteDto,
  QuoteApprovalDecisionDto,
  UpdateQuoteDto,
} from './dto/quote.dto';
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
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.quotesService.findAll(user);
  }

  @Get(':id')
  @RequirePermission('quote', 'read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotesService.findOne(id, user);
  }

  @Patch(':id')
  @RequirePermission('quote', 'update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotesService.update(id, dto, user);
  }

  @Post(':id/submit-for-approval')
  @RequirePermission('quote', 'update')
  submitForApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotesService.submitForApproval(id, user);
  }

  @Post(':id/approve')
  @RequirePermission('quote', 'approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QuoteApprovalDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotesService.approve(id, user, dto);
  }

  @Post(':id/reject')
  @RequirePermission('quote', 'approve')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QuoteApprovalDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotesService.reject(id, user, dto);
  }
}
