import { Injectable } from '@nestjs/common';
import { MESSAGES, VALIDATION_MESSAGES, ERROR_MESSAGES, SUCCESS_MESSAGES, LOG_MESSAGES } from './messages.constants';

export interface MessageContext {
  resource?: string;
  action?: string;
  userId?: string;
  companyId?: string;
  postId?: string;
  [key: string]: any;
}

@Injectable()
export class MessagesService {
  /**
   * Obtém uma mensagem de validação
   */
  getValidationMessage(category: keyof typeof VALIDATION_MESSAGES, key: string, context?: MessageContext): string {
    const message = VALIDATION_MESSAGES[category]?.[key];
    return this.interpolateMessage(message, context);
  }

  /**
   * Obtém uma mensagem de erro
   */
getErrorMessage(category: keyof typeof ERROR_MESSAGES, key: string, context?: MessageContext): string {
    const message = ERROR_MESSAGES[category]?.[key];
    return this.interpolateMessage(message, context);
  }

  /**
   * Obtém uma mensagem de sucesso
   */
  getSuccessMessage(category: keyof typeof SUCCESS_MESSAGES, key: string, context?: MessageContext): string {
    const message = SUCCESS_MESSAGES[category]?.[key];
    return this.interpolateMessage(message, context);
  }

  /**
   * Obtém uma mensagem de log
   */
  getLogMessage(category: keyof typeof LOG_MESSAGES, key: string, context?: MessageContext): string {
    const message = LOG_MESSAGES[category]?.[key];
    return this.interpolateMessage(message, context);
  }

  /**
   * Obtém uma mensagem específica por recurso
   */
  getResourceMessage(resource: string, action: string, context?: MessageContext): string {
    const resourceMessages = {
      user: {
        created: 'Usuário criado com sucesso',
        updated: 'Usuário atualizado com sucesso',
        deleted: 'Usuário deletado com sucesso',
        notFound: 'Usuário não encontrado',
        alreadyExists: 'Usuário já existe',
      },
      company: {
        created: 'Empresa criada com sucesso',
        updated: 'Empresa atualizada com sucesso',
        deleted: 'Empresa deletada com sucesso',
        notFound: 'Empresa não encontrada',
        alreadyExists: 'Empresa já existe',
      },
      post: {
        created: 'Posto criado com sucesso',
        updated: 'Posto atualizado com sucesso',
        deleted: 'Posto deletado com sucesso',
        notFound: 'Posto não encontrado',
        alreadyExists: 'Posto já existe',
      },
      patrol: {
        created: 'Ronda criada com sucesso',
        updated: 'Ronda atualizada com sucesso',
        deleted: 'Ronda deletada com sucesso',
        notFound: 'Ronda não encontrada',
        started: 'Ronda iniciada',
        completed: 'Ronda concluída',
      },
      incident: {
        created: 'Incidente registrado com sucesso',
        updated: 'Incidente atualizado com sucesso',
        resolved: 'Incidente resolvido',
        notFound: 'Incidente não encontrado',
      },
    };

    const message = resourceMessages[resource]?.[action] || `${resource} ${action}`;
    return this.interpolateMessage(message, context);
  }

  /**
   * Obtém uma mensagem de validação específica por campo
   */
  getFieldValidationMessage(field: string, type: string, context?: MessageContext): string {
    const fieldMessages = {
      name: {
        required: 'Nome é obrigatório',
        minLength: 'Nome deve ter pelo menos 2 caracteres',
        maxLength: 'Nome deve ter no máximo 100 caracteres',
      },
      email: {
        required: 'Email é obrigatório',
        invalid: 'Email inválido',
        exists: 'Este email já está cadastrado',
      },
      password: {
        required: 'Senha é obrigatória',
        weak: 'Senha deve atender aos requisitos de segurança',
        minLength: 'Senha deve ter pelo menos 8 caracteres',
      },
      cpf: {
        required: 'CPF é obrigatório',
        invalid: 'CPF inválido',
        exists: 'Este CPF já está cadastrado',
      },
      phone: {
        invalid: 'Telefone deve estar no formato brasileiro',
        required: 'Telefone é obrigatório',
      },
      companyId: {
        required: 'Empresa é obrigatória',
        invalid: 'Empresa inválida',
        notFound: 'Empresa não encontrada',
      },
      postId: {
        required: 'Posto é obrigatório',
        invalid: 'Posto inválido',
        notFound: 'Posto não encontrado',
      },
    };

    const message = fieldMessages[field]?.[type] || `${field} ${type}`;
    return this.interpolateMessage(message, context);
  }

  /**
   * Obtém uma mensagem de erro HTTP
   */
  getHttpErrorMessage(statusCode: number, context?: MessageContext): string {
    const httpMessages = {
      400: 'Requisição inválida',
      401: 'Não autorizado',
      403: 'Acesso negado',
      404: 'Recurso não encontrado',
      409: 'Conflito de dados',
      422: 'Dados inválidos',
      429: 'Muitas requisições. Tente novamente em alguns minutos.',
      500: 'Erro interno do servidor',
      502: 'Erro de gateway',
      503: 'Serviço indisponível',
    };

    const message = httpMessages[statusCode] || 'Erro desconhecido';
    return this.interpolateMessage(message, context);
  }

  /**
   * Interpola variáveis em uma mensagem
   */
  private interpolateMessage(message: string, context?: MessageContext): string {
    if (!message || !context) return message;

    return message.replace(/\{(\w+)\}/g, (match, key) => {
      return context[key] || match;
    });
  }

  /**
   * Obtém todas as mensagens organizadas
   */
  getAllMessages(): typeof MESSAGES {
    return MESSAGES;
  }

  /**
   * Obtém mensagens por categoria
   */
  getMessagesByCategory(category: keyof typeof MESSAGES): any {
    return MESSAGES[category];
  }

  /**
   * Cria uma mensagem customizada com interpolação
   */
  createCustomMessage(template: string, context: MessageContext): string {
    return this.interpolateMessage(template, context);
  }

  /**
   * Obtém mensagem de log estruturada
   */
  getStructuredLogMessage(
    action: string,
    resource: string,
    context: MessageContext
  ): { message: string; metadata: any } {
    const message = `${action} ${resource}`;
    const metadata = {
      action,
      resource,
      timestamp: new Date().toISOString(),
      ...context,
    };

    return { message, metadata };
  }
} 