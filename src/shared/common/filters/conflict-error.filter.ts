import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { ConflictError } from '../errors';
import { BaseExceptionFilter } from './base-exception.filter';
import { MessagesService } from '../messages/messages.service';

@Catch(ConflictError)
export class ConflictErrorFilter extends BaseExceptionFilter implements ExceptionFilter {
  constructor(messagesService: MessagesService) {
    super(messagesService);
  }

  catch(exception: ConflictError, host: ArgumentsHost) {
    this.sendErrorResponse(
      exception,
      host,
      HttpStatus.CONFLICT,
      'CONFLICT',
      exception.message ||
        this.messagesService.getErrorMessage('RESOURCE', 'ALREADY_EXISTS'),
    );
  }
} 