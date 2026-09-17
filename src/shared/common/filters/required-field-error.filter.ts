import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { RequiredFieldError } from '../errors';
import { BaseExceptionFilter } from './base-exception.filter';
import { MessagesService } from '../messages/messages.service';

@Catch(RequiredFieldError)
export class RequiredFieldErrorFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(messagesService: MessagesService) {
    super(messagesService);
  }

  catch(exception: RequiredFieldError, host: ArgumentsHost) {
    this.sendErrorResponse(
      exception,
      host,
      HttpStatus.BAD_REQUEST,
      'NOT_FOUND',
      this.messagesService.getErrorMessage('RESOURCE', 'REQUIRED_FIELD'),
    );
  }
}
