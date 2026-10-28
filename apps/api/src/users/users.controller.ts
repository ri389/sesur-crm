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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import {
  CreateBulkInvitationsDto,
  CreateInvitationDto,
  UpdateUserDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('user', 'read')
  list() {
    return this.users.list();
  }

  @Get('invitations')
  @RequirePermission('user', 'read')
  listInvitations() {
    return this.users.listInvitations();
  }

  @Get('invitation-email-index')
  @RequirePermission('user', 'read')
  invitationEmailIndex() {
    return this.users.invitationEmailIndex();
  }

  @Post('bulk-invitations')
  @RequirePermission('user', 'create')
  @HttpCode(HttpStatus.CREATED)
  createInvitations(
    @Body() dto: CreateBulkInvitationsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.users.createInvitations(dto.emails, dto.roleId, user.id, req.get('origin'));
  }

  @Post('invitations/:id/resend')
  @RequirePermission('user', 'create')
  @HttpCode(HttpStatus.OK)
  resendInvitation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.users.resendInvitation(id, user.id, req.get('origin'));
  }

  @Get(':id')
  @RequirePermission('user', 'read')
  findById(@Param('id') id: string) {
    return this.users.findById(id);
  }

  @Post()
  @RequirePermission('user', 'create')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateInvitationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.users.createInvitation(dto, user.id, req.get('origin'));
  }

  @Patch(':id')
  @RequirePermission('user', 'update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.users.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('user', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.users.delete(id, user.id);
  }
}

@Controller('roles')
export class RolesController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('user', 'read')
  list() {
    return this.users.listRoles();
  }
}
