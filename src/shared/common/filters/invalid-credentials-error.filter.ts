import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { InvalidCredentialsError } from '../errors';
import { BaseExceptionFilter } from './base-exception.filter';
import { MessagesService } from '../messages/messages.service';

@Catch(InvalidCredentialsError)
export class InvalidCredentialsErrorFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(messagesService: MessagesService) {
    super(messagesService);
  }

  catch(exception: InvalidCredentialsError, host: ArgumentsHost) {
    this.sendErrorResponse(
      exception,
      host,
      HttpStatus.UNAUTHORIZED,
      'INVALID_CREDENTIALS',
      this.messagesService.getErrorMessage('AUTH', 'INVALID_CREDENTIALS'),
    );
  }
}
