import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { ListOpportunitiesDto } from './dto/list-opportunities.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { UpdateOpportunityStageDto } from './dto/update-opportunity-stage.dto';
import { OpportunitiesService } from './opportunities.service';

@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Post()
  @RequirePermission('opportunity', 'create')
  create(
    @Body() dto: CreateOpportunityDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.opportunities.create(
      dto,
      req.user!,
      requestContext(req),
    );
  }

  @Get()
  @RequirePermission('opportunity', 'read')
  findAll(
    @Query() query: ListOpportunitiesDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.opportunities.findAll(query, req.user!);
  }

  @Get(':id')
  @RequirePermission('opportunity', 'read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.opportunities.findOne(id, req.user!);
  }

  @Patch(':id/stage')
  @RequirePermission('opportunity', 'update')
  updateStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOpportunityStageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.opportunities.updateStage(
      id,
      dto,
      req.user!,
      requestContext(req),
    );
  }

  @Patch(':id')
  @RequirePermission('opportunity', 'update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOpportunityDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.opportunities.update(
      id,
      dto,
      req.user!,
      requestContext(req),
    );
  }

  @Delete(':id')
  @RequirePermission('opportunity', 'delete')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.opportunities.remove(
      id,
      req.user!,
      requestContext(req),
    );
  }
}