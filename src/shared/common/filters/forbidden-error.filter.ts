import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { ForbiddenError } from '../errors';
import { BaseExceptionFilter } from './base-exception.filter';
import { MessagesService } from '../messages/messages.service';

@Catch(ForbiddenError)
export class ForbiddenErrorFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(messagesService: MessagesService) {
    super(messagesService);
  }

  catch(exception: ForbiddenError, host: ArgumentsHost) {
    this.sendErrorResponse(
      exception,
      host,
      HttpStatus.FORBIDDEN,
      'FORBIDDEN',
      this.messagesService.getErrorMessage('AUTHORIZATION', 'FORBIDDEN'),
    );
  }
}
