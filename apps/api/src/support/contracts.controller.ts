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
  CreateContractDto,
  ListContractsDto,
  UpdateContractDto,
} from './dto/support.dto';
import { ContractsService } from './contracts.service';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @RequirePermission('contract', 'read')
  list(@Query() query: ListContractsDto, @Req() req: AuthenticatedRequest) {
    return this.contracts.findAll(query, req.user!);
  }

  @Get(':id')
  @RequirePermission('contract', 'read')
  get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.contracts.findOne(id, req.user!);
  }

  @Post()
  @RequirePermission('contract', 'create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateContractDto, @Req() req: AuthenticatedRequest) {
    return this.contracts.create(dto, req.user!, requestContext(req));
  }

  @Patch(':id')
  @RequirePermission('contract', 'update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.contracts.update(id, dto, req.user!, requestContext(req));
  }

  @Delete(':id')
  @RequirePermission('contract', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    await this.contracts.remove(id, req.user!, requestContext(req));
  }
}
