import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import {
  AuthService,
  RefreshTokenService,
  PasswordService,
  SessionService,
} from './services';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PasswordResetService } from './services/password-reset.service';
import { EmailService } from './services/email.service';
import { AuditService } from './services/audit.service';
import { SecurityService } from './services/security.service';
import { MetricsService } from './services/metrics.service';
import { LoginService } from './services/login.service';
import { OAuthService } from './services/oauth.service';
import { AuthValidator } from './validators/auth.validator';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthGuard } from './guards/auth.guard';
import { RefreshGuard } from './guards/refresh.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { PassportModule } from '@nestjs/passport';
import { GoogleStrategy } from './strategies/google.strategy';
import { MicrosoftStrategy } from './strategies/microsoft.strategy';
import { MeCompanyService } from './services/me-company.service';
import { MeNotificationPreferencesService } from './services/me-notification-preferences.service';
import { RoleGuard } from './guards/role.guard';

@Global()
@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService): Promise<JwtModuleOptions> => {
        const expiresIn = configService.get<string>('JWT_EXPIRES_IN', '15m');
        return {
          secret: configService.get<string>('JWT_SECRET'),
          signOptions: { expiresIn },
        } as JwtModuleOptions;
      },
      inject: [ConfigService],
    }),
    PrismaModule,
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: 'JWT_CONFIG_LOGGER',
      useFactory: () => {
        return 'JWT_CONFIG_LOGGED';
      },
    },
    AuthService,
    RefreshTokenService,
    PasswordService,
    SessionService,
    PasswordResetService,
    EmailService,
    AuditService,
    SecurityService,
    MetricsService,
    LoginService,
    OAuthService,
    AuthValidator,
    AuthGuard,
    RefreshGuard,
    RateLimitGuard,
    AuthInterceptor,
    GoogleStrategy,
    MicrosoftStrategy,
    MeCompanyService,
    MeNotificationPreferencesService,
    RoleGuard,
  ],
  exports: [
    JwtModule,
    AuthService,
    RefreshTokenService,
    PasswordService,
    SessionService,
    PasswordResetService,
    EmailService,
    AuditService,
    SecurityService,
    MetricsService,
    LoginService,
    OAuthService,
    AuthValidator,
    AuthGuard,
    RefreshGuard,
    RateLimitGuard,
    AuthInterceptor,
  ],
})
export class AuthModule {}
