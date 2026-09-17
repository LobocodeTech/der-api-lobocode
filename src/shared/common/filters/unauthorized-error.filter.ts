import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { UnauthorizedError } from '../errors';
import { BaseExceptionFilter } from './base-exception.filter';
import { MessagesService } from '../messages/messages.service';

@Catch(UnauthorizedError)
export class UnauthorizedErrorFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(messagesService: MessagesService) {
    super(messagesService);
  }

  catch(exception: UnauthorizedError, host: ArgumentsHost) {
    const invalidCredentials = this.resolveInvalidCredentialsFailure(
      exception.message,
    );

    if (invalidCredentials) {
      this.sendErrorResponse(
        exception,
        host,
        HttpStatus.UNAUTHORIZED,
        invalidCredentials.errorCode,
        invalidCredentials.message,
      );
      return;
    }

    this.sendErrorResponse(
      exception,
      host,
      HttpStatus.UNAUTHORIZED,
      'UNAUTHORIZED',
      this.messagesService.getErrorMessage('AUTH', 'UNAUTHORIZED'),
    );
  }
}
