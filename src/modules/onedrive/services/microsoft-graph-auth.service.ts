import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MicrosoftTokenResponse } from '../types/onedrive-upload.types';

interface CachedAccessToken {
  accessToken: string;
  expiresAtMs: number;
}

/**
 * Renova access tokens Microsoft Graph a partir do refresh token da conta fixa.
 */
@Injectable()
export class MicrosoftGraphAuthService {
  private readonly logger = new Logger(MicrosoftGraphAuthService.name);
  private cachedToken: CachedAccessToken | null = null;
  private runtimeRefreshToken: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Indica se as credenciais OneDrive estão presentes no ambiente.
   */
  isConfigurado(): boolean {
    return Boolean(
      this.obterClientId() &&
        this.obterClientSecret() &&
        this.obterRefreshTokenAtual(),
    );
  }

  /**
   * Retorna um access token válido (cache ou renovação via refresh_token).
   */
  async obterAccessToken(): Promise<string> {
    this.validarConfiguracao();
    const agora = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAtMs > agora + 60_000) {
      return this.cachedToken.accessToken;
    }
    const tokens = await this.renovarAccessToken();
    const expiresInSec = tokens.expires_in || 3600;
    this.cachedToken = {
      accessToken: tokens.access_token,
      expiresAtMs: agora + expiresInSec * 1000,
    };
    if (tokens.refresh_token) {
      this.runtimeRefreshToken = tokens.refresh_token;
      this.logger.warn(
        'Microsoft retornou um novo refresh_token. Atualize MICROSOFT_REFRESH_TOKEN no .env se a renovação falhar após reiniciar a API.',
      );
    }
    return tokens.access_token;
  }

  private validarConfiguracao(): void {
    if (this.isConfigurado()) {
      return;
    }
    throw new ServiceUnavailableException(
      'Integração OneDrive não configurada. Defina MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET e MICROSOFT_REFRESH_TOKEN. Veja docs/ONEDRIVE-EXPORT-SETUP.md.',
    );
  }

  private async renovarAccessToken(): Promise<MicrosoftTokenResponse> {
    const tenant = this.obterTenant();
    const body = new URLSearchParams({
      client_id: this.obterClientId(),
      client_secret: this.obterClientSecret(),
      grant_type: 'refresh_token',
      refresh_token: this.obterRefreshTokenAtual(),
      scope: 'Files.ReadWrite offline_access User.Read',
    });
    const response = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );
    const payload = (await response.json()) as MicrosoftTokenResponse;
    if (!response.ok || !payload.access_token) {
      const detail =
        payload.error_description || payload.error || 'erro desconhecido';
      this.logger.error(`Falha ao renovar token Microsoft Graph: ${detail}`);
      throw new ServiceUnavailableException(
        `Falha ao autenticar no OneDrive: ${detail}. Se o refresh token expirou, rode npm run onedrive:oauth-setup.`,
      );
    }
    return payload;
  }

  private obterClientId(): string {
    return this.configService.get<string>('MICROSOFT_CLIENT_ID', '').trim();
  }

  private obterClientSecret(): string {
    return this.configService
      .get<string>('MICROSOFT_CLIENT_SECRET', '')
      .trim();
  }

  private obterRefreshTokenAtual(): string {
    if (this.runtimeRefreshToken) {
      return this.runtimeRefreshToken;
    }
    return this.configService
      .get<string>('MICROSOFT_REFRESH_TOKEN', '')
      .trim();
  }

  /**
   * Tenant do token OneDrive. Separado de MICROSOFT_TENANT (login OAuth),
   * que no app costuma ser `common`.
   */
  private obterTenant(): string {
    const onedriveTenant = this.configService
      .get<string>('ONEDRIVE_TENANT', '')
      .trim();
    if (onedriveTenant) {
      return onedriveTenant;
    }
    return 'consumers';
  }
}
