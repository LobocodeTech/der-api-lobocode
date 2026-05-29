import {
  ArgumentsHost,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MessagesService } from '../messages/messages.service';
import { AUTH_MESSAGES } from 'src/shared/auth/constants';

export abstract class BaseExceptionFilter {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly messagesService: MessagesService) {}

  /**
   * Detecta automaticamente erros de token baseado na mensagem
   */
  protected detectTokenError(exception: any): {
    isTokenError: boolean;
    errorCode: string;
  } {
    if (exception instanceof UnauthorizedException) {
      const message = exception.message;

      // Mapear mensagens específicas para códigos de erro
      if (message === AUTH_MESSAGES.ERROR.TOKEN_INVALID) {
        return { isTokenError: true, errorCode: 'TOKEN_INVALID' };
      }

      if (message === AUTH_MESSAGES.ERROR.TOKEN_EXPIRED) {
        return { isTokenError: true, errorCode: 'TOKEN_EXPIRED' };
      }

      if (message === AUTH_MESSAGES.VALIDATION.TOKEN_REQUIRED) {
        return { isTokenError: true, errorCode: 'TOKEN_REQUIRED' };
      }

      if (message === AUTH_MESSAGES.ERROR.USER_NOT_FOUND) {
        return { isTokenError: true, errorCode: 'USER_NOT_FOUND' };
      }
    }

    return { isTokenError: false, errorCode: 'UNKNOWN_ERROR' };
  }

  /**
   * Retorna resposta padronizada para qualquer erro
   */
  protected sendErrorResponse(
    exception: any,
    host: ArgumentsHost,
    status: HttpStatus,
    errorCode: string,
    message: string,
  ) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Não logar 404 para favicon.ico (requisição automática do navegador)
    const isFavicon404 =
      status === HttpStatus.NOT_FOUND && request.path === '/favicon.ico';
    if (!isFavicon404) {
      this.logger.error(
        `HTTP ${status} Error: ${exception.message || message}`,
        exception.stack,
        `${request.method} ${request.url}`,
      );
    }

    // Resposta minimalista padronizada
    const errorResponse = {
      error: errorCode,
      message: message || exception.message,
    };

    response.status(status).json(errorResponse);
  }
}
