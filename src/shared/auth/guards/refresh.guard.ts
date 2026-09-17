import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AUTH_MESSAGES } from '../constants';

@Injectable()
export class RefreshGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();

    try {
      const refreshToken = this.extractRefreshToken(request);
      this.validateRefreshTokenExists(refreshToken);

      // TODO: Integrar com RefreshTokenService
      // const isValid = await this.refreshTokenService.isValid(refreshToken!);
      // if (!isValid) {
      //   throw new UnauthorizedException(AUTH_MESSAGES.ERROR.REFRESH_TOKEN_INVALID);
      // }

      // Por enquanto, aceita qualquer token não vazio
      if (!refreshToken || refreshToken.trim() === '') {
        throw new UnauthorizedException(
          AUTH_MESSAGES.ERROR.REFRESH_TOKEN_INVALID,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(
        AUTH_MESSAGES.ERROR.REFRESH_TOKEN_INVALID,
      );
    }
  }

  /**
   * Extrai o refresh token do header ou body
   */
  private extractRefreshToken(request: Request): string | undefined {
    // Tenta extrair do header primeiro
    const headerToken = request.headers['x-refresh-token'] as string;
    if (headerToken) {
      return headerToken;
    }

    // Tenta extrair do body
    const bodyToken = request.body?.refreshToken;
    if (bodyToken) {
      return bodyToken;
    }

    // Tenta extrair do cookie
    const cookieToken = request.cookies?.refresh_token;
    if (cookieToken) {
      return cookieToken;
    }

    return undefined;
  }

  /**
   * Valida se o refresh token existe
   */
  private validateRefreshTokenExists(refreshToken: string | undefined): void {
    if (!refreshToken) {
      throw new UnauthorizedException(
        AUTH_MESSAGES.VALIDATION.REFRESH_TOKEN_REQUIRED,
      );
    }
  }
}
