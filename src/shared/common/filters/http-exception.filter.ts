import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter } from './base-exception.filter';
import { MessagesService } from '../messages/messages.service';

@Catch(HttpException)
export class HttpExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(messagesService: MessagesService) {
    super(messagesService);
  }

  catch(exception: HttpException, host: ArgumentsHost) {
    const status = exception.getStatus();
    const message = exception.message;

    // Detectar erros de token automaticamente
    const tokenError = this.detectTokenError(exception);
    if (tokenError.isTokenError) {
      this.sendErrorResponse(
        exception,
        host,
        status,
        tokenError.errorCode,
        message,
      );
      return;
    }

    // Determinar código de erro específico
    let errorCode = 'UNKNOWN_ERROR';
    let clientMessage = this.messagesService.getHttpErrorMessage(500);

    switch (status) {
      case HttpStatus.BAD_REQUEST: {
        errorCode = 'BAD_REQUEST';
        const validationDetails = this.extractValidationErrors(exception);
        const invalidCredentials = this.resolveInvalidCredentialsFailure(
          validationDetails || message,
        );

        if (invalidCredentials) {
          errorCode = invalidCredentials.errorCode;
          clientMessage = invalidCredentials.message;
        } else {
          clientMessage =
            validationDetails ||
            message ||
            this.messagesService.getErrorMessage('VALIDATION', 'INVALID_DATA');
        }
        break;
      }
      case HttpStatus.UNPROCESSABLE_ENTITY: {
        errorCode = 'VALIDATION_ERROR';
        const validationDetails = this.extractValidationErrors(exception);
        clientMessage =
          validationDetails ||
          message ||
          this.messagesService.getErrorMessage('VALIDATION', 'INVALID_DATA');
        break;
      }
      case HttpStatus.NOT_FOUND:
        errorCode = 'NOT_FOUND';
        clientMessage = this.messagesService.getErrorMessage(
          'RESOURCE',
          'NOT_FOUND',
        );
        break;
      case HttpStatus.UNAUTHORIZED: {
        const validationDetails = this.extractValidationErrors(exception);
        const invalidCredentials = this.resolveInvalidCredentialsFailure(
          validationDetails || message,
        );

        if (invalidCredentials) {
          errorCode = invalidCredentials.errorCode;
          clientMessage = invalidCredentials.message;
        } else {
          errorCode = 'UNAUTHORIZED';
          clientMessage =
            validationDetails ||
            message ||
            this.messagesService.getHttpErrorMessage(401);
        }
        break;
      }
      case HttpStatus.FORBIDDEN:
        errorCode = 'FORBIDDEN';
        clientMessage = this.messagesService.getErrorMessage(
          'AUTHORIZATION',
          'FORBIDDEN',
        );
        break;
      case HttpStatus.CONFLICT:
        errorCode = 'CONFLICT';
        clientMessage = this.messagesService.getErrorMessage(
          'RESOURCE',
          'ALREADY_EXISTS',
        );
        break;
      case HttpStatus.TOO_MANY_REQUESTS:
        errorCode = 'RATE_LIMIT_EXCEEDED';
        clientMessage =
          this.extractValidationErrors(exception) ||
          message ||
          this.messagesService.getHttpErrorMessage(429);
        break;
      case HttpStatus.INTERNAL_SERVER_ERROR:
        errorCode = 'INTERNAL_SERVER_ERROR';
        clientMessage = this.messagesService.getErrorMessage(
          'SYSTEM',
          'INTERNAL_ERROR',
        );
        break;
      default:
        errorCode = 'UNKNOWN_ERROR';
        clientMessage = this.messagesService.getHttpErrorMessage(500);
    }

    this.sendErrorResponse(exception, host, status, errorCode, clientMessage);
  }

  /**
   * Extrai detalhes dos erros de validação do ValidationPipe
   */
  private extractValidationErrors(exception: HttpException): string | null {
    try {
      const response = exception.getResponse();

      // Se a resposta é um objeto com propriedade 'message' que é um array
      if (typeof response === 'object' && response !== null) {
        const responseObj = response as any;

        if (Array.isArray(responseObj.message)) {
          // Extrair as mensagens de validação específicas
          const validationMessage = responseObj.message.join(', ');

          return validationMessage;
        }

        if (typeof responseObj.message === 'string') {
          return responseObj.message;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }
}
