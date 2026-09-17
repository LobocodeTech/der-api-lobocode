import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { OAuthService } from '../services/oauth.service';

export interface GoogleProfile {
  id: string;
  displayName: string;
  emails: Array<{ value: string; verified: boolean }>;
  photos: Array<{ value: string }>;
  provider: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  private static resolveGoogleCallbackUrl(
    configService: ConfigService,
  ): string {
    const isProduction = configService.get<string>('NODE_ENV') === 'production';
    const explicitCallback = configService
      .get<string>('GOOGLE_CALLBACK_URL')
      ?.trim();
    if (explicitCallback) {
      const isLocalhostExplicit =
        explicitCallback.includes('://localhost') ||
        explicitCallback.includes('://127.0.0.1');
      if (!isProduction || !isLocalhostExplicit) return explicitCallback;
    }

    const appHost = configService.get<string>('APP_HOST')?.trim();
    if (appHost) return `https://${appHost}/auth/google/callback`;

    if (isProduction) {
      throw new Error(
        'Google OAuth inválido em produção: defina GOOGLE_CALLBACK_URL HTTPS válido ou APP_HOST.',
      );
    }

    return 'http://localhost:3000/auth/google/callback';
  }

  constructor(
    private readonly configService: ConfigService,
    private readonly oauthService: OAuthService,
  ) {
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID', '');
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET', '');
    const callbackURL = GoogleStrategy.resolveGoogleCallbackUrl(configService);

    super({
      clientID,
      clientSecret,
      callbackURL,
      proxy: true,
      scope: ['email', 'profile'],
    });

    if (
      configService.get<string>('NODE_ENV') === 'production' &&
      callbackURL.includes('localhost')
    ) {
      this.logger.warn(
        `GOOGLE_CALLBACK_URL está apontando para localhost em produção: ${callbackURL}`,
      );
    }
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: GoogleProfile,
    done: VerifyCallback,
  ): Promise<void> {
    if (
      !this.configService.get<string>('GOOGLE_CLIENT_ID') ||
      !this.configService.get<string>('GOOGLE_CLIENT_SECRET')
    ) {
      done(new Error('Google OAuth configuration is missing'));
      return;
    }

    const { id, displayName, emails, photos } = profile;
    const email = emails?.[0]?.value;
    const picture = photos?.[0]?.value;

    const user = await this.oauthService.buscarOuCriarUserPorOAuth({
      provider: 'google',
      providerId: id,
      email,
      name: displayName,
      picture,
      accessToken,
      refreshToken,
    });

    done(null, user);
  }
}
