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
import { Organization } from '@prisma/client';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { RequirePermission } from '../../auth/require-permission.decorator';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';
import { OrganizationService } from './organization.service';

@Controller('organizations')
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Get()
  @RequirePermission('organization', 'read')
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('isClient') isClient?: string,
    @Query('search') search?: string,
  ): Promise<Organization[]> {
    const isClientBool =
      isClient !== undefined ? isClient === 'true' : undefined;
    return this.orgService.findAll({ isClient: isClientBool, search }, user);
  }

  @Get(':id')
  @RequirePermission('organization', 'read')
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Organization> {
    return this.orgService.findById(id, user);
  }

  @Post()
  @RequirePermission('organization', 'create')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<Organization> {
    return this.orgService.create(dto, user?.id);
  }

  @Patch(':id')
  @RequirePermission('organization', 'update')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<Organization> {
    return this.orgService.update(id, dto, user?.id);
  }

  @Delete(':id')
  @RequirePermission('organization', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<void> {
    await this.orgService.delete(id, user?.id);
  }
}
