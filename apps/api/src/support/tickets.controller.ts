import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { requestContext } from '../auth/auth.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import {
  CreateTicketCommentDto,
  CreateTicketDto,
  ListTicketsDto,
  UpdateTicketDto,
  UpdateTicketEscalationDto,
} from './dto/support.dto';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @RequirePermission('ticket', 'read')
  list(@Query() query: ListTicketsDto, @Req() req: AuthenticatedRequest) {
    return this.tickets.findAll(query, req.user!);
  }

  @Get(':id')
  @RequirePermission('ticket', 'read')
  get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.tickets.findOne(id, req.user!);
  }

  @Post()
  @RequirePermission('ticket', 'create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTicketDto, @Req() req: AuthenticatedRequest) {
    return this.tickets.create(dto, req.user!, requestContext(req));
  }

  @Patch(':id')
  @RequirePermission('ticket', 'update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tickets.update(id, dto, req.user!, requestContext(req));
  }

  @Post(':id/comments')
  @RequirePermission('ticket', 'comment')
  @HttpCode(HttpStatus.CREATED)
  comment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTicketCommentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tickets.addComment(id, dto, req.user!, requestContext(req));
  }

  @Patch(':id/escalation')
  @RequirePermission('ticket', 'escalate')
  escalate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketEscalationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tickets.setEscalated(
      id,
      dto.escalated,
      req.user!,
      requestContext(req),
    );
  }

  @Delete(':id')
  @RequirePermission('ticket', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    await this.tickets.remove(id, req.user!, requestContext(req));
  }
}
