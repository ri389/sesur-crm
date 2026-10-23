import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CrmCoreModule } from './crm-core/crm-core.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { QuotesModule } from './quotes/quotes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    CrmCoreModule,
    OpportunitiesModule,
    QuotesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
