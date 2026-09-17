import {
  Body,
  Controller,
  Post,
  Patch,
  UseGuards,
  HttpCode,
  Get,
  Query,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import {
  LoginDto,
  RefreshDto,
  LogoutDto,
  ForgotPasswordDto,
  ChangeMyPasswordDto,
  ValidateForgotPasswordTokenDto,
  ForgotPasswordResetDto,
} from './dto';
import { AUTH_MESSAGES } from './constants';
import { AuthService } from './services';
import { AuthGuard, RefreshGuard, RateLimitGuard } from './guards';
import { RoleGuard } from './guards/role.guard';
import { Public } from './decorators';
import { PasswordResetService } from './services/password-reset.service';
import { MetricsService } from './services/metrics.service';
import { OAuthService } from './services/oauth.service';
import { MessagesService } from '../common/messages/messages.service';
import { Request, Response } from 'express';
import { UnauthorizedError } from '../common/errors';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { RequestUser } from './interfaces';
import { RequiredRoles } from './required-roles.decorator';
import { Roles } from '@prisma/client';
import { MeCompanyService } from './services/me-company.service';
import { MeNotificationPreferencesService } from './services/me-notification-preferences.service';
import { UpdateMyCompanyDto } from './dto/update-my-company.dto';
import { UpdateMyNotificationPreferencesDto } from './dto/update-my-notification-preferences.dto';
import { toPublicMeUser } from './auth-me.mapper';
import { GoogleStrategy } from './strategies/google.strategy';
import { MicrosoftStrategy } from './strategies/microsoft.strategy';
import { OAuthRedirectExceptionFilter } from './filters/oauth-redirect-exception.filter';

@Controller('auth')
export class AuthController {
  private static readonly OAUTH_FRONTEND_COOKIE = 'oauth_frontend_url';

  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly metricsService: MetricsService,
    private readonly messagesService: MessagesService,
    private readonly oauthService: OAuthService,
    private readonly configService: ConfigService,
    private readonly meCompanyService: MeCompanyService,
    private readonly meNotificationPreferencesService: MeNotificationPreferencesService,
    // Garante registro das strategies no Passport sem falhar no bootstrap.
    private readonly googleStrategy: GoogleStrategy,
    private readonly microsoftStrategy: MicrosoftStrategy,
  ) {}

  private normalizeFrontendOrigin(rawUrl: string | undefined): string | null {
    if (!rawUrl) return null;

    try {
      const parsed = new URL(rawUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      return parsed.origin;
    } catch {
      return null;
    }
  }

  private isAllowedFrontendOrigin(
    origin: string,
    fallbackOrigin: string,
  ): boolean {
    if (origin === fallbackOrigin) return true;

    try {
      const parsed = new URL(origin);
      return (
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '[::1]'
      );
    } catch {
      return false;
    }
  }

  private extractCookieValue(req: Request, cookieName: string): string | null {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [name, ...valueParts] = cookie.trim().split('=');
      if (name !== cookieName) continue;
      return decodeURIComponent(valueParts.join('='));
    }

    return null;
  }

  private resolveOAuthFrontendUrl(req: Request): string {
    const fallbackUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3111',
    );
    const fallbackOrigin =
      this.normalizeFrontendOrigin(fallbackUrl) ?? 'http://localhost:3111';

    const cookieOrigin = this.normalizeFrontendOrigin(
      this.extractCookieValue(req, AuthController.OAUTH_FRONTEND_COOKIE) ??
        undefined,
    );

    if (
      cookieOrigin &&
      this.isAllowedFrontendOrigin(cookieOrigin, fallbackOrigin)
    ) {
      return cookieOrigin;
    }

    return fallbackOrigin;
  }

  private clearOAuthFrontendCookie(res: Response): void {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    res.clearCookie(AuthController.OAUTH_FRONTEND_COOKIE, {
      path: '/',
      sameSite: 'lax',
      secure: isProduction,
    });
  }

  @Post('login')
  @Public()
  @UseGuards(RateLimitGuard)
  async login(@Body() loginDto: LoginDto, @Req() request: Request) {
    return this.authService.login(loginDto, request);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() request: Request) {
    return { data: toPublicMeUser(request.user as any) };
  }

  @Patch('me/company')
  @UseGuards(AuthGuard, RoleGuard)
  @RequiredRoles(Roles.ADMIN)
  async updateMyCompany(
    @Req() request: Request,
    @Body() dto: UpdateMyCompanyDto,
  ) {
    const authUser = request.user as { id: string };
    const company = await this.meCompanyService.updateByUserId(
      authUser.id,
      dto,
    );
    return { data: { company } };
  }

  @Patch('me/notification-preferences')
  @UseGuards(AuthGuard)
  async updateMyNotificationPreferences(
    @Req() request: Request,
    @Body() dto: UpdateMyNotificationPreferencesDto,
  ) {
    const authUser = request.user as { id: string };
    const prefs = await this.meNotificationPreferencesService.updateByUserId(
      authUser.id,
      dto,
    );
    return { data: prefs };
  }

  @Patch('me/password')
  @UseGuards(AuthGuard)
  async changeMyPassword(
    @Req() request: Request,
    @Body() dto: ChangeMyPasswordDto,
  ) {
    const authUser = request.user as { id: string };
    return this.authService.changeMyPassword(authUser.id, dto);
  }

  @Post('refresh')
  @Public()
  @UseGuards(RefreshGuard, RateLimitGuard)
  async refresh(@Body() refreshDto: RefreshDto, @Req() request: Request) {
    return this.authService.refresh(refreshDto.refreshToken, request);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async logout(@Body() logoutDto: LogoutDto, @Req() request: Request) {
    try {
      await this.authService.logout(logoutDto.refreshToken, request);
    } catch (error) {
      // Logout sempre retorna sucesso, mesmo se o token for inválido
      console.warn('Logout warning:', (error as Error).message);
    }
  }

  @Post('logout-all')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async logoutAll(@Body() logoutDto: LogoutDto, @Req() request: Request) {
    const userId = (request.user as RequestUser | undefined)?.id;
    if (!userId) {
      throw new UnauthorizedError(
        this.messagesService.getErrorMessage('AUTH', 'USER_NOT_FOUND'),
      );
    }
    return this.authService.logoutAll(userId, request);
  }

  /**
   * Solicita reset de senha
   */
  @Post('forgot-password')
  @Public()
  @UseGuards(RateLimitGuard)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    await this.passwordResetService.requestPasswordReset(dto, request);
    return {
      message: AUTH_MESSAGES.SUCCESS.PASSWORD_RESET_REQUESTED,
    };
  }

  /**
   * Valida token de recuperação de senha
   */
  @Post('forgot-password/validate-token')
  @Public()
  @UseGuards(RateLimitGuard)
  async validateForgotPasswordToken(
    @Body() dto: ValidateForgotPasswordTokenDto,
    @Req() request: Request,
  ): Promise<{ valid: true }> {
    return this.passwordResetService.validateResetToken(dto, request);
  }

  /**
   * Redefine senha com token de recuperação
   */
  @Post('forgot-password/reset')
  @Public()
  @UseGuards(RateLimitGuard)
  async resetForgotPassword(
    @Body() dto: ForgotPasswordResetDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    await this.passwordResetService.resetPassword(dto, request);
    return {
      message: AUTH_MESSAGES.SUCCESS.PASSWORD_RESET_SUCCESS,
    };
  }

  /**
   * Obtém métricas de autenticação
   */
  @Get('metrics')
  @UseGuards(AuthGuard)
  async getAuthMetrics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return await this.metricsService.getAuthMetrics(start, end);
  }

  /**
   * Obtém métricas de segurança
   */
  @Get('security-metrics')
  @UseGuards(AuthGuard)
  async getSecurityMetrics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return await this.metricsService.getSecurityMetrics(start, end);
  }

  /**
   * Obtém métricas em tempo real
   */
  @Get('real-time-metrics')
  @UseGuards(AuthGuard)
  async getRealTimeMetrics() {
    return await this.metricsService.getRealTimeMetrics();
  }

  /**
   * Obtém alertas de segurança
   */
  @Get('security-alerts')
  @UseGuards(AuthGuard)
  async getSecurityAlerts() {
    return await this.metricsService.getSecurityAlerts();
  }

  /**
   * Obtém top usuários ativos
   */
  @Get('top-active-users')
  @UseGuards(AuthGuard)
  async getTopActiveUsers(@Query('limit') limit?: string) {
    const limitNumber = limit ? parseInt(limit) : 10;
    return await this.metricsService.getTopActiveUsers(limitNumber);
  }

  /**
   * Exporta métricas
   */
  @Get('export-metrics')
  @UseGuards(AuthGuard)
  async exportMetrics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('format') format: 'json' | 'csv' = 'json',
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    return await this.metricsService.exportMetrics(start, end, format);
  }

  // ─── OAuth Google ────────────────────────────────────────────────────────────

  @Get('google/start')
  @Public()
  iniciarFluxoGoogleComFrontend(
    @Query('frontend_url') frontendUrl: string | undefined,
    @Res() res: Response,
  ): void {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const parsed = this.normalizeFrontendOrigin(frontendUrl);
    if (parsed) {
      res.cookie(AuthController.OAUTH_FRONTEND_COOKIE, parsed, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        maxAge: 10 * 60 * 1000,
        path: '/',
      });
    }

    res.redirect('/auth/google');
  }

  @Get('google')
  @Public()
  @UseGuards(PassportAuthGuard('google'))
  iniciarLoginGoogle(): void {
    // Passport redireciona automaticamente para o Google
  }

  @Get('google/callback')
  @Public()
  @UseFilters(OAuthRedirectExceptionFilter)
  @UseGuards(PassportAuthGuard('google'))
  async callbackGoogle(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const user = req.user as any;
    const tokens = this.oauthService.gerarTokensOAuth(user, req, 'google');
    const frontendUrl = this.resolveOAuthFrontendUrl(req);
    this.clearOAuthFrontendCookie(res);

    const params = new URLSearchParams({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? '',
      provider: 'google',
      ...(tokens.isPending ? { pending: 'true' } : {}),
    });

    res.redirect(`${frontendUrl}/oauth/callback?${params.toString()}`);
  }

  // ─── OAuth Microsoft ─────────────────────────────────────────────────────────

  @Get('microsoft/start')
  @Public()
  iniciarFluxoMicrosoftComFrontend(
    @Query('frontend_url') frontendUrl: string | undefined,
    @Res() res: Response,
  ): void {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const parsed = this.normalizeFrontendOrigin(frontendUrl);
    if (parsed) {
      res.cookie(AuthController.OAUTH_FRONTEND_COOKIE, parsed, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        maxAge: 10 * 60 * 1000,
        path: '/',
      });
    }

    res.redirect('/auth/microsoft');
  }

  @Get('microsoft')
  @Public()
  @UseGuards(PassportAuthGuard('microsoft'))
  iniciarLoginMicrosoft(): void {
    // Passport redireciona automaticamente para a Microsoft
  }

  @Get('microsoft/callback')
  @Public()
  @UseFilters(OAuthRedirectExceptionFilter)
  @UseGuards(PassportAuthGuard('microsoft'))
  async callbackMicrosoft(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const user = req.user as any;
    const tokens = this.oauthService.gerarTokensOAuth(user, req, 'microsoft');
    const frontendUrl = this.resolveOAuthFrontendUrl(req);
    this.clearOAuthFrontendCookie(res);

    const params = new URLSearchParams({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? '',
      provider: 'microsoft',
      ...(tokens.isPending ? { pending: 'true' } : {}),
    });

    res.redirect(`${frontendUrl}/oauth/callback?${params.toString()}`);
  }
}
