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
import { CreateTaskDto, ListTasksDto, UpdateTaskDto } from './dto/activity.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @RequirePermission('task', 'read')
  list(@Query() query: ListTasksDto, @Req() req: AuthenticatedRequest) {
    return this.tasks.findAll(query, req.user!);
  }

  @Get(':id')
  @RequirePermission('task', 'read')
  get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.tasks.findOne(id, req.user!);
  }

  @Post()
  @RequirePermission('task', 'create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTaskDto, @Req() req: AuthenticatedRequest) {
    return this.tasks.create(dto, req.user!, requestContext(req));
  }

  @Patch(':id')
  @RequirePermission('task', 'update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasks.update(id, dto, req.user!, requestContext(req));
  }

  @Delete(':id')
  @RequirePermission('task', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    await this.tasks.remove(id, req.user!, requestContext(req));
  }
}
