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
} from '@nestjs/common';
import {
  LoginDto,
  RefreshDto,
  LogoutDto,
  ForgotPasswordDto,
  ValidateResetTokenDto,
  ResetPasswordDto,
} from './dto';
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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly metricsService: MetricsService,
    private readonly messagesService: MessagesService,
    private readonly oauthService: OAuthService,
    private readonly configService: ConfigService,
    private readonly meCompanyService: MeCompanyService,
    private readonly meNotificationPreferencesService: MeNotificationPreferencesService,
  ) {}

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
    const company = await this.meCompanyService.updateByUserId(authUser.id, dto);
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
        this.messagesService.getErrorMessage('AUTH', 'USER_NOT_FOUND')
      );
    }
    return this.authService.logoutAll(userId, request);
  }

  /**
   * Solicita reset de senha
   */
  @Post('forgot-password')
  @Public()
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.passwordResetService.requestPasswordReset(dto);
    return {
      message: this.messagesService.getSuccessMessage('OPERATIONS', 'EMAIL_SENT'),
    };
  }

  /**
   * Valida token de reset
   */
  @Post('validate-reset-token')
  @Public()
  async validateResetToken(
    @Body() dto: ValidateResetTokenDto,
  ): Promise<{ isValid: boolean }> {
    const isValid = await this.passwordResetService.validateResetToken(dto);
    return { isValid };
  }

  /**
   * Reseta senha
   */
  @Post('reset-password')
  @Public()
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.passwordResetService.resetPassword(dto);
    return { 
      message: this.messagesService.getSuccessMessage('OPERATIONS', 'PASSWORD_CHANGED')
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

  @Get('google')
  @Public()
  @UseGuards(PassportAuthGuard('google'))
  iniciarLoginGoogle(): void {
    // Passport redireciona automaticamente para o Google
  }

  @Get('google/callback')
  @Public()
  @UseGuards(PassportAuthGuard('google'))
  async callbackGoogle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const user = req.user as any;
    const tokens = this.oauthService.gerarTokensOAuth(user);
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:5173');

    const params = new URLSearchParams({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? '',
      provider: 'google',
      ...(tokens.isPending ? { pending: 'true' } : {}),
    });

    res.redirect(`${frontendUrl}/oauth/callback?${params.toString()}`);
  }

  // ─── OAuth Microsoft ─────────────────────────────────────────────────────────

  @Get('microsoft')
  @Public()
  @UseGuards(PassportAuthGuard('microsoft'))
  iniciarLoginMicrosoft(): void {
    // Passport redireciona automaticamente para a Microsoft
  }

  @Get('microsoft/callback')
  @Public()
  @UseGuards(PassportAuthGuard('microsoft'))
  async callbackMicrosoft(@Req() req: Request, @Res() res: Response): Promise<void> {
    const user = req.user as any;
    const tokens = this.oauthService.gerarTokensOAuth(user);
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:5173');

    const params = new URLSearchParams({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? '',
      provider: 'microsoft',
      ...(tokens.isPending ? { pending: 'true' } : {}),
    });

    res.redirect(`${frontendUrl}/oauth/callback?${params.toString()}`);
  }
}
