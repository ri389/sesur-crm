import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateTeamDto, UpdateTeamDto } from './dto/user.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  @RequirePermission('team', 'read')
  list() {
    return this.teams.list();
  }

  @Post()
  @RequirePermission('team', 'create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTeamDto, @CurrentUser() user: AuthenticatedUser) {
    return this.teams.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('team', 'update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teams.update(id, dto, user.id);
  }
}
