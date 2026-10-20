import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { RolesController, UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, RolesController, TeamsController],
  providers: [UsersService, TeamsService],
})
export class UsersModule {}
