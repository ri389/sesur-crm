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
  CreateCalendarEventDto,
  ListCalendarEventsDto,
  UpdateCalendarEventDto,
} from './dto/activity.dto';
import { CalendarService } from './calendar.service';

@Controller('calendar/events')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  @RequirePermission('calendar', 'read')
  list(@Query() query: ListCalendarEventsDto, @Req() req: AuthenticatedRequest) {
    return this.calendar.findAll(query, req.user!);
  }

  @Get(':id')
  @RequirePermission('calendar', 'read')
  get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.calendar.findOne(id, req.user!);
  }

  @Post()
  @RequirePermission('calendar', 'create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCalendarEventDto, @Req() req: AuthenticatedRequest) {
    return this.calendar.create(dto, req.user!, requestContext(req));
  }

  @Patch(':id')
  @RequirePermission('calendar', 'update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCalendarEventDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.calendar.update(id, dto, req.user!, requestContext(req));
  }

  @Delete(':id')
  @RequirePermission('calendar', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    await this.calendar.remove(id, req.user!, requestContext(req));
  }
}
