import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { ImportLeadsDto } from './dto/import-leads.dto';
import { ImportService } from './import.service';

@Controller('imports')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Post('leads')
  @RequirePermission('import', 'create')
  @HttpCode(HttpStatus.OK)
  async importLeads(
    @Body() dto: ImportLeadsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.imports.importLeads(dto, user.id);
  }
}
