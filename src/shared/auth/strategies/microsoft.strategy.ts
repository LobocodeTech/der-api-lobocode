import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-microsoft';
import { OAuthService } from '../services/oauth.service';

export interface MicrosoftProfile {
  id: string;
  displayName: string;
  emails: Array<{ type: string; value: string }>;
  _json: {
    id: string;
    displayName: string;
    mail: string;
    userPrincipalName: string;
  };
}

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  private readonly logger = new Logger(MicrosoftStrategy.name);

  private static resolveMicrosoftCallbackUrl(
    configService: ConfigService,
  ): string {
    const isProduction = configService.get<string>('NODE_ENV') === 'production';
    const explicitCallback = configService
      .get<string>('MICROSOFT_CALLBACK_URL')
      ?.trim();
    if (explicitCallback) {
      const isLocalhostExplicit =
        explicitCallback.includes('://localhost') ||
        explicitCallback.includes('://127.0.0.1');
      if (!isProduction || !isLocalhostExplicit) return explicitCallback;
    }

    const appHost = configService.get<string>('APP_HOST')?.trim();
    if (appHost) return `https://${appHost}/auth/microsoft/callback`;

    if (isProduction) {
      throw new Error(
        'Microsoft OAuth inválido em produção: defina MICROSOFT_CALLBACK_URL HTTPS válido ou APP_HOST.',
      );
    }

    return 'http://localhost:3000/auth/microsoft/callback';
  }

  constructor(
    private readonly configService: ConfigService,
    private readonly oauthService: OAuthService,
  ) {
    const clientID = configService.get<string>('MICROSOFT_CLIENT_ID', '');
    const clientSecret = configService.get<string>(
      'MICROSOFT_CLIENT_SECRET',
      '',
    );
    const callbackURL =
      MicrosoftStrategy.resolveMicrosoftCallbackUrl(configService);
    const tenant = configService.get<string>('MICROSOFT_TENANT', 'common');

    super({
      // Evita quebrar o bootstrap de outros provedores quando Microsoft nao estiver configurado.
      clientID: clientID || 'missing-microsoft-client-id',
      clientSecret: clientSecret || 'missing-microsoft-client-secret',
      callbackURL,
      proxy: true,
      scope: ['user.read'],
      tenant,
    });

    if (
      configService.get<string>('NODE_ENV') === 'production' &&
      callbackURL.includes('localhost')
    ) {
      this.logger.warn(
        `MICROSOFT_CALLBACK_URL está apontando para localhost em produção: ${callbackURL}`,
      );
    }
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: MicrosoftProfile,
    done: (error: Error | null, user?: unknown) => void,
  ): Promise<void> {
    if (
      !this.configService.get<string>('MICROSOFT_CLIENT_ID') ||
      !this.configService.get<string>('MICROSOFT_CLIENT_SECRET')
    ) {
      done(new Error('Microsoft OAuth configuration is missing'));
      return;
    }

    const { id, displayName, emails, _json } = profile;
    const email = emails?.[0]?.value ?? _json?.mail ?? _json?.userPrincipalName;

    const user = await this.oauthService.buscarOuCriarUserPorOAuth({
      provider: 'microsoft',
      providerId: id,
      email,
      name: displayName,
      accessToken,
      refreshToken,
    });

    done(null, user);
  }
}
