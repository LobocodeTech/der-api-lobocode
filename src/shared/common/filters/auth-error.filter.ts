import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter } from './base-exception.filter';
import { MessagesService } from '../messages/messages.service';
import { AUTH_MESSAGES } from 'src/shared/auth/constants';

@Catch(HttpException)
export class AuthErrorFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(messagesService: MessagesService) {
    super(messagesService);
  }

  catch(exception: HttpException, host: ArgumentsHost) {
    const status = exception.getStatus();
    const message = exception.message;

    // Apenas tratar erros de autenticação (401)
    if (status !== HttpStatus.UNAUTHORIZED) {
      return;
    }

    // Determinar código de erro específico
    let errorCode = 'UNAUTHORIZED';
    let clientMessage = this.messagesService.getErrorMessage(
      'AUTH',
      'UNAUTHORIZED',
    );

    if (message.includes(AUTH_MESSAGES.ERROR.TOKEN_INVALID)) {
      errorCode = 'TOKEN_INVALID';
      clientMessage = this.messagesService.getErrorMessage(
        'AUTH',
        'UNAUTHORIZED',
      );
    } else if (message.includes(AUTH_MESSAGES.ERROR.TOKEN_EXPIRED)) {
      errorCode = 'TOKEN_EXPIRED';
      clientMessage = this.messagesService.getErrorMessage(
        'AUTH',
        'TOKEN_EXPIRED',
      );
    } else if (message.includes(AUTH_MESSAGES.VALIDATION.TOKEN_REQUIRED)) {
      errorCode = 'TOKEN_REQUIRED';
      clientMessage = this.messagesService.getErrorMessage(
        'AUTH',
        'UNAUTHORIZED',
      );
    } else if (
      message.includes(AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS) ||
      message.includes(AUTH_MESSAGES.ERROR.USER_INACTIVE) ||
      message.includes(AUTH_MESSAGES.ERROR.USER_NOT_FOUND) ||
      message.includes(
        this.messagesService.getErrorMessage('RESOURCE', 'INACTIVE'),
      ) ||
      message.includes(
        this.messagesService.getErrorMessage('RESOURCE', 'DELETED'),
      )
    ) {
      errorCode = 'INVALID_CREDENTIALS';
      clientMessage = this.messagesService.getErrorMessage(
        'AUTH',
        'INVALID_CREDENTIALS',
      );
    }

    this.sendErrorResponse(
      exception,
      host,
      HttpStatus.UNAUTHORIZED,
      errorCode,
      clientMessage,
    );
  }
}
