import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

@Injectable()
@Catch()
export class OAuthRedirectExceptionFilter implements ExceptionFilter {
  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const frontendUrl = this.resolveOAuthFrontendUrl(req);
    const provider = req.path.includes('/microsoft/') ? 'microsoft' : 'google';
    const errorMessage = this.extractErrorMessage(exception);

    const params = new URLSearchParams({
      provider,
      error: 'oauth_login_failed',
      error_description: errorMessage,
    });

    this.clearOAuthFrontendCookie(res);
    res.redirect(`${frontendUrl}/oauth/callback?${params.toString()}`);
  }

  private extractErrorMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') return response;

      if (response && typeof response === 'object') {
        const message = (response as { message?: unknown }).message;
        if (Array.isArray(message) && message.length > 0)
          return String(message[0]);
        if (typeof message === 'string') return message;
      }
    }

    if (exception instanceof Error && exception.message) {
      return exception.message;
    }

    return 'Falha ao autenticar com o provedor OAuth.';
  }

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
      this.extractCookieValue(req, 'oauth_frontend_url') ?? undefined,
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
    res.clearCookie('oauth_frontend_url', {
      path: '/',
      sameSite: 'lax',
      secure: isProduction,
    });
  }
}
