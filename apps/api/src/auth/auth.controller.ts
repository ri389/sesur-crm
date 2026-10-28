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
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { AuthFlowService } from './auth-flow.service';
import { AUTH_SETTINGS, SESSION_COOKIE_NAME } from './auth.settings';
import type { AuthSettings } from './auth.settings';
import { requestContext } from './auth.types';
import type { AuthenticatedRequest, AuthenticatedUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { RegistrationDraftService } from './registration-draft.service';
import {
  CreateRegistrationDraftDto,
  RegisterDto,
  SaveRegistrationDraftDto,
  ValidateInvitationDto,
  VerifyTotpDto,
} from './dto/verify-totp.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthFlowService,
    private readonly registrationDrafts: RegistrationDraftService,
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
  @UseGuards(LoginRateLimitGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.auth.login(
      body.email,
      body.password,
      requestContext(req),
    );
  }

  @Public()
  @UseGuards(LoginRateLimitGuard)
  @Post(['verify-code', 'verify-totp'])
  @HttpCode(HttpStatus.OK)
  async verifyCode(
    @Body() body: VerifyTotpDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthenticatedUser }> {
    const { token, expiresAt, user } = await this.auth.verifyChallenge(
      body.challengeToken,
      body.code,
      requestContext(req),
    );
    res.cookie(SESSION_COOKIE_NAME, token, {
      ...this.cookieOptions(),
      expires: expiresAt,
    });
    return { user };
  }

  @Public()
  @UseGuards(LoginRateLimitGuard)
  @Post('invitations/validate')
  @HttpCode(HttpStatus.OK)
  validateInvitation(@Body() body: ValidateInvitationDto) {
    return this.auth.validateInvitation(body.token);
  }

  @Public()
  @UseGuards(LoginRateLimitGuard)
  @Post('registration-drafts')
  @HttpCode(HttpStatus.OK)
  createRegistrationDraft(@Body() body: CreateRegistrationDraftDto) {
    return this.registrationDrafts.createOrResume(body);
  }

  @Public()
  @UseGuards(LoginRateLimitGuard)
  @Post('registration-drafts/save')
  @HttpCode(HttpStatus.OK)
  saveRegistrationDraft(@Body() body: SaveRegistrationDraftDto) {
    return this.registrationDrafts.save(body);
  }

  @Public()
  @UseGuards(LoginRateLimitGuard)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() body: RegisterDto, @Req() req: AuthenticatedRequest) {
    return this.auth.register(body, requestContext(req));
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

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Body() body: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.changePassword(
      user.id,
      body.currentPassword,
      body.newPassword,
      requestContext(req),
    );
    res.clearCookie(SESSION_COOKIE_NAME, this.cookieOptions());
  }
}
