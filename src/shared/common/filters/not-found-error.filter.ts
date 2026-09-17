import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { NotFoundError } from '../errors';
import { BaseExceptionFilter } from './base-exception.filter';
import { MessagesService } from '../messages/messages.service';

@Catch(NotFoundError)
export class NotFoundErrorFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(messagesService: MessagesService) {
    super(messagesService);
  }

  catch(exception: NotFoundError, host: ArgumentsHost) {
    this.sendErrorResponse(
      exception,
      host,
      HttpStatus.NOT_FOUND,
      'NOT_FOUND',
      this.messagesService.getErrorMessage('RESOURCE', 'NOT_FOUND'),
    );
  }
}
