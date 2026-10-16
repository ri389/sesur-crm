import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { AuthService } from './auth.service';
import { AUTH_SETTINGS, SESSION_COOKIE_NAME } from './auth.settings';
import type { AuthSettings } from './auth.settings';
import { requestContext } from './auth.types';
import type { AuthenticatedRequest, AuthenticatedUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.settings.cookieSecure,
      sameSite: 'strict',
      path: '/api',
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthenticatedUser }> {
    const { token, expiresAt, user } = await this.auth.login(
      body.email,
      body.password,
      requestContext(req),
    );
    res.cookie(SESSION_COOKIE_NAME, token, {
      ...this.cookieOptions(),
      expires: expiresAt,
    });
    return { user };
  }

  /** Publique pour pouvoir toujours effacer le cookie, même si la session a expiré. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token: unknown = req.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token === 'string' && token !== '') {
      await this.auth.logout(token, requestContext(req));
    }
    res.clearCookie(SESSION_COOKIE_NAME, this.cookieOptions());
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): { user: AuthenticatedUser } {
    return { user };
  }
}
