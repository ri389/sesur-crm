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
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('user', 'read')
  list() {
    return this.users.list();
  }

  @Get(':id')
  @RequirePermission('user', 'read')
  findById(@Param('id') id: string) {
    return this.users.findById(id);
  }

  @Post()
  @RequirePermission('user', 'create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.users.create(dto, user.id);
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
