import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Lead, LeadStatus } from '@prisma/client';
import { accessFor } from '../../auth/access';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { DuplicateService, type DuplicateCandidate } from '../duplicates/duplicate.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadService } from './lead.service';

@Controller('leads')
export class LeadController {
  constructor(
    private readonly leadService: LeadService,
    private readonly duplicateService: DuplicateService,
  ) {}

  @Get()
  @RequirePermission('lead', 'read')
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: LeadStatus,
    @Query('search') search?: string,
    @Query('assignedUserId') assignedUserId?: string,
  ): Promise<Lead[]> {
    return this.leadService.findAll(
      { status, search, assignedUserId },
      accessFor(user, 'lead', 'read'),
    );
  }

  @Post('check-duplicates')
  @RequirePermission('lead', 'create')
  @HttpCode(HttpStatus.OK)
  async checkDuplicates(
    @Body()
    body: {
      email?: string;
      phone?: string;
      companyName?: string;
      firstName?: string;
      lastName?: string;
      excludeId?: string;
    },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ candidates: DuplicateCandidate[] }> {
    const candidates = await this.duplicateService.checkDuplicates(
      body,
      accessFor(user, 'lead', 'create'),
    );
    return { candidates };
  }

  @Get(':id')
  @RequirePermission('lead', 'read')
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Lead> {
    return this.leadService.findById(id, accessFor(user, 'lead', 'read'));
  }

  @Post()
  @RequirePermission('lead', 'create')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Lead> {
    return this.leadService.create(
      dto,
      user.id,
      accessFor(user, 'lead', 'create'),
    );
  }

  @Patch(':id')
  @RequirePermission('lead', 'update')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Lead> {
    return this.leadService.update(
      id,
      dto,
      user.id,
      accessFor(user, 'lead', 'update'),
    );
  }

  @Delete(':id')
  @RequirePermission('lead', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.leadService.delete(id, user.id, accessFor(user, 'lead', 'delete'));
  }

  @Post(':id/qualify')
  @RequirePermission('lead', 'update')
  @HttpCode(HttpStatus.OK)
  async qualify(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Lead> {
    return this.leadService.qualify(
      id,
      user.id,
      accessFor(user, 'lead', 'update'),
    );
  }

  @Post(':id/convert')
  @RequirePermission('lead', 'convert')
  @HttpCode(HttpStatus.OK)
  async convert(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ lead: Lead; organization: unknown; contact: unknown }> {
    return this.leadService.convertToClient(
      id,
      user.id,
      accessFor(user, 'lead', 'convert'),
    );
  }
}
