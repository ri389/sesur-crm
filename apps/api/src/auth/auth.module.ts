import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AUTH_SETTINGS, loadAuthSettings } from './auth.settings';
import { PasswordService } from './password.service';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { PermissionsGuard } from './permissions.guard';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_SETTINGS,
      inject: [ConfigService],
      useFactory: loadAuthSettings,
    },
    PasswordService,
    LoginRateLimitGuard,
    SessionService,
    AuthService,
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [PasswordService, SessionService, AUTH_SETTINGS],
})
export class AuthModule {}
