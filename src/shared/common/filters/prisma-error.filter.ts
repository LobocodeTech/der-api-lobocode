import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BaseExceptionFilter } from './base-exception.filter';
import { MessagesService } from '../messages/messages.service';
import { VALIDATION_MESSAGES } from '../messages/messages.constants';

/**
 * Filtro para capturar e tratar erros específicos do Prisma
 * Converte PrismaClientValidationError e PrismaClientKnownRequestError
 * em respostas HTTP mais amigáveis
 */
@Catch(
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
)
export class PrismaErrorFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(messagesService: MessagesService) {
    super(messagesService);
  }

  catch(exception: any, host: ArgumentsHost) {
    // Trata diferentes tipos de erro do Prisma
    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.handleValidationError(exception, host);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      this.handleKnownRequestError(exception, host);
    } else if (exception instanceof Prisma.PrismaClientUnknownRequestError) {
      this.handleUnknownRequestError(exception, host);
    } else {
      this.handleGenericPrismaError(exception, host);
    }
  }

  /**
   * Trata erros de validação do Prisma (dados inválidos)
   */
  private handleValidationError(
    exception: Prisma.PrismaClientValidationError,
    host: ArgumentsHost,
  ) {
    const message = this.extractValidationErrorMessage(exception.message);
    exception.message = message;
    this.sendErrorResponse(
      exception,
      host,
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      message,
    );
  }

  /**
   * Trata erros conhecidos do Prisma (códigos P2xxx)
   */
  private handleKnownRequestError(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ) {
    const { status, errorCode, message } = this.mapPrismaErrorCode(
      exception.code,
      exception.meta,
    );

    this.sendErrorResponse(exception, host, status, errorCode, message);
  }

  /**
   * Trata erros desconhecidos do Prisma
   */
  private handleUnknownRequestError(
    exception: Prisma.PrismaClientUnknownRequestError,
    host: ArgumentsHost,
  ) {
    this.sendErrorResponse(
      exception,
      host,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'DATABASE_ERROR',
      'Erro interno do banco de dados',
    );
  }

  /**
   * Trata outros erros genéricos do Prisma
   */
  private handleGenericPrismaError(exception: any, host: ArgumentsHost) {
    this.sendErrorResponse(
      exception,
      host,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'DATABASE_ERROR',
      'Erro interno do banco de dados',
    );
  }

  /**
   * Extrai mensagem amigável de erros de validação
   */
  private extractValidationErrorMessage(prismaMessage: string): string {
    // Detecta erro de enum inválido
    if (
      prismaMessage.includes('Invalid value for argument') &&
      prismaMessage.includes('Expected')
    ) {
      const fieldMatch = prismaMessage.match(
        /Invalid value for argument `(\w+)`/,
      );
      const expectedMatch = prismaMessage.match(/Expected (\w+)/);

      if (fieldMatch && expectedMatch) {
        const field = fieldMatch[1];
        const expectedType = expectedMatch[1];
        return `Valor inválido para o campo '${field}'. Esperado: ${expectedType}`;
      }
    }

    // Detecta campo obrigatório ausente
    if (
      prismaMessage.includes('Argument') &&
      prismaMessage.includes('is missing')
    ) {
      const fieldMatch = prismaMessage.match(/Argument `(\w+)` is missing/);
      if (fieldMatch) {
        const field = fieldMatch[1];
        return `Campo obrigatório '${field}' está ausente`;
      }
    }

    // Detecta tipo de dados inválido
    if (
      prismaMessage.includes('Argument') &&
      prismaMessage.includes('of type')
    ) {
      const fieldMatch = prismaMessage.match(/Argument `(\w+)`.*of type (\w+)/);
      if (fieldMatch) {
        const field = fieldMatch[1];
        const expectedType = fieldMatch[2];
        return `Campo '${field}' deve ser do tipo ${expectedType}`;
      }
    }

    // Fallback para mensagem genérica mais amigável
    return 'Dados inválidos fornecidos na requisição';
  }

  /**
   * Mapeia códigos de erro do Prisma para respostas HTTP
   */
  private mapPrismaErrorCode(
    code: string,
    meta?: any,
  ): {
    status: HttpStatus;
    errorCode: string;
    message: string;
  } {
    switch (code) {
      case 'P2000':
        return {
          status: HttpStatus.BAD_REQUEST,
          errorCode: 'VALUE_TOO_LONG',
          message: 'Valor fornecido é muito longo para o campo',
        };

      case 'P2001':
        return {
          status: HttpStatus.NOT_FOUND,
          errorCode: 'RECORD_NOT_FOUND',
          message: 'Registro não encontrado',
        };

      case 'P2002': {
        const fields = Array.isArray(meta?.target)
          ? (meta.target as string[])
          : [];
        let message = VALIDATION_MESSAGES.UNIQUENESS.FIELD_EXISTS;
        if (fields.includes('email')) {
          message = VALIDATION_MESSAGES.UNIQUENESS.EMAIL_EXISTS;
        } else if (fields.includes('login')) {
          message = VALIDATION_MESSAGES.UNIQUENESS.LOGIN_EXISTS;
        }
        return {
          status: HttpStatus.CONFLICT,
          errorCode: 'UNIQUE_CONSTRAINT_VIOLATION',
          message,
        };
      }

      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          errorCode: 'FOREIGN_KEY_CONSTRAINT',
          message: 'Referência inválida a registro relacionado',
        };

      case 'P2004':
        return {
          status: HttpStatus.BAD_REQUEST,
          errorCode: 'CONSTRAINT_VIOLATION',
          message: 'Violação de restrição do banco de dados',
        };

      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          errorCode: 'RECORD_NOT_FOUND',
          message: 'Registro não encontrado para operação',
        };

      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          errorCode: 'DATABASE_ERROR',
          message: `Erro do banco de dados (${code})`,
        };
    }
  }
}
