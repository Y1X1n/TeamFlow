import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { DomainError } from '../../common/domain-error';
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from '@teamflow/shared/schemas';
import { Public } from '../../common/public.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthService, type SessionResult } from './auth.service';

const REFRESH_COOKIE = 'tf_refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.getOrThrow<boolean>('COOKIE_SECURE'),
      path: '/api/v1/auth',
      maxAge: this.config.getOrThrow<number>('REFRESH_TTL_DAYS') * 24 * 60 * 60 * 1000,
    };
  }

  private dto(session: SessionResult): Omit<SessionResult, 'refreshToken'> {
    return {
      user: session.user,
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
    };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<SessionResult, 'refreshToken'>> {
    const session = await this.auth.register(body);
    res.cookie(REFRESH_COOKIE, session.refreshToken, this.cookieOptions());
    return this.dto(session);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  @HttpCode(200)
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<SessionResult, 'refreshToken'>> {
    const session = await this.auth.login(body);
    res.cookie(REFRESH_COOKIE, session.refreshToken, this.cookieOptions());
    return this.dto(session);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 15 * 60 * 1000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<SessionResult, 'refreshToken'>> {
    const raw = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];
    if (!raw) {
      throw new DomainError('REFRESH_TOKEN_INVALID', 401, 'Missing refresh token');
    }
    const session = await this.auth.refresh(raw);
    res.cookie(REFRESH_COOKIE, session.refreshToken, this.cookieOptions());
    return this.dto(session);
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const raw = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];
    await this.auth.logout(raw);
    res.clearCookie(REFRESH_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
  }
}
