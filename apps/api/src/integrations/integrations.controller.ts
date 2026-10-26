import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { requestContext } from '../auth/auth.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { IntegrationsService } from './integrations.service';

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('status')
  @RequirePermission('integration', 'read')
  status() {
    return this.integrations.getStatus();
  }

  @Get('deliveries')
  @RequirePermission('integration', 'read')
  deliveries() {
    return this.integrations.listDeliveries();
  }

  @Post('deliveries/:id/replay')
  @RequirePermission('integration', 'replay')
  replay(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.integrations.replay(id, req.user!, requestContext(req));
  }
}
