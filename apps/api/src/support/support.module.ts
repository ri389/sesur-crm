import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [TicketsController, ContractsController],
  providers: [TicketsService, ContractsService],
})
export class SupportModule {}
