import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Interaction } from '@prisma/client';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { CreateInteractionDto } from './dto/interaction.dto';
import { InteractionService } from './interaction.service';

@Controller('interactions')
export class InteractionController {
  constructor(private readonly interactions: InteractionService) {}

  @Get()
  @RequirePermission('interaction', 'read')
  async findAll(
    @Query('leadId') leadId?: string,
    @Query('contactId') contactId?: string,
    @Query('organizationId') organizationId?: string,
  ): Promise<Interaction[]> {
    return this.interactions.findAll({ leadId, contactId, organizationId });
  }

  @Post()
  @RequirePermission('interaction', 'create')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateInteractionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Interaction> {
    return this.interactions.create(dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('interaction', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.interactions.delete(id, user.id);
  }
}
