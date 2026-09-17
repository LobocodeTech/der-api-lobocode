import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AUTH_MESSAGES } from '../constants';
import { UnauthorizedError } from 'src/shared/common/errors';

@Injectable()
export class AuthInterceptor implements NestInterceptor {
  constructor() {
    // private readonly refreshTokenService: RefreshTokenService, // será injetado depois
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        // Se o erro for de token expirado, tenta renovar automaticamente
        if (this.isTokenExpiredError(error)) {
          return this.handleTokenExpired(context, next);
        }

        return throwError(() => error);
      }),
    );
  }

  /**
   * Verifica se o erro é de token expirado
   */
  private isTokenExpiredError(error: any): boolean {
    return (
      error?.status === 401 &&
      error?.message === AUTH_MESSAGES.ERROR.TOKEN_EXPIRED
    );
  }

  /**
   * Tenta renovar o token automaticamente
   */
  private handleTokenExpired(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const refreshToken = this.extractRefreshToken(request);

    if (!refreshToken) {
      return throwError(
        () => new UnauthorizedError(AUTH_MESSAGES.ERROR.TOKEN_EXPIRED),
      );
    }

    // TODO: Implementar renovação automática
    // return this.refreshTokenService.refresh(refreshToken).pipe(
    //   switchMap((newTokens) => {
    //     // Atualiza o token na requisição
    //     request.headers.authorization = `Bearer ${newTokens.access_token}`;
    //
    //     // Retorna a resposta com novos tokens
    //     const response = context.switchToHttp().getResponse();
    //     response.setHeader('X-New-Access-Token', newTokens.access_token);
    //     response.setHeader('X-New-Refresh-Token', newTokens.refresh_token);
    //
    //     // Repete a requisição original com o novo token
    //     return next.handle();
    //   }),
    //   catchError((refreshError) => {
    //     // Se falhar ao renovar, retorna erro de autenticação
    //     return throwError(() => new UnauthorizedError(AUTH_MESSAGES.ERROR.REFRESH_TOKEN_INVALID));
    //   }),
    // );

    // Por enquanto, apenas retorna erro
    return throwError(
      () => new UnauthorizedError(AUTH_MESSAGES.ERROR.TOKEN_EXPIRED),
    );
  }

  /**
   * Extrai refresh token da requisição
   */
  private extractRefreshToken(request: any): string | undefined {
    return (
      request.headers['x-refresh-token'] ||
      request.body?.refreshToken ||
      request.cookies?.refresh_token
    );
  }
}
