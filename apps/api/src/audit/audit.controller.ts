import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermission } from '../auth/require-permission.decorator';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit', 'read')
  list(
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
  ) {
    return this.audit.list({ action, entityType });
  }
}
