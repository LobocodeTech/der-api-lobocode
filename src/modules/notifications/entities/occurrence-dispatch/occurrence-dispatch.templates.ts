/**
 * 🚨 TEMPLATES DE NOTIFICAÇÃO - OCCURRENCE DISPATCH
 *
 * Templates específicos para despacho de ocorrências.
 * Focado em empresa de segurança com informações contextuais.
 */

import {
  NotificationTemplate,
  NotificationContext,
} from '../../shared/notification.types';

/**
 * 🚨 TEMPLATES PARA OCCURRENCE DISPATCH
 */
export const OCCURRENCE_DISPATCH_TEMPLATES: Record<
  string,
  NotificationTemplate
> = {
  created: {
    title: 'Novo Despacho de Ocorrência',
    message:
      '{userName} despachou ocorrência para {guardName}{postName} às {time}',
    priority: 'HIGH',
    recipients: 'GUARD_AND_ACTIVE_SUPERVISORS', // Guarda + supervisores ativos + admins
  },
  updated: {
    title: 'Despacho de Ocorrência Atualizado',
    message:
      '{userName} atualizou despacho de ocorrência para {guardName}{postName} às {time}',
    priority: 'HIGH',
    recipients: 'GUARD_AND_ACTIVE_SUPERVISORS', // Guarda + supervisores ativos + admins
  },
  completed: {
    title: 'Despacho de Ocorrência Concluído',
    message:
      '{userName} concluiu despacho de ocorrência para {guardName}{postName} às {time}',
    priority: 'NORMAL',
    recipients: 'ADMINS_AND_SUPERVISORS', // Apenas admins e supervisores
  },
};

/**
 * 🔧 OCCURRENCE DISPATCH TEMPLATE SERVICE
 */
export class OccurrenceDispatchTemplateService {
  /**
   * Obtém template por operação
   */
  static getTemplate(operation: string): NotificationTemplate | null {
    const template = OCCURRENCE_DISPATCH_TEMPLATES[operation];
    if (!template) {
      console.warn(
        `Template não encontrado para operação: occurrenceDispatch.${operation}`,
      );
      return null;
    }
    return template;
  }

  /**
   * Substitui variáveis no template
   */
  static renderTemplate(
    template: NotificationTemplate,
    context: NotificationContext,
  ): NotificationTemplate {
    const renderText = (text: string): string => {
      return text.replace(/\{(\w+)\}/g, (match, key) => {
        const value = context[key as keyof NotificationContext];
        return value !== undefined ? String(value) : match;
      });
    };

    return {
      ...template,
      title: renderText(template.title),
      message: renderText(template.message),
    };
  }

  /**
   * Valida se todas as variáveis necessárias estão presentes
   */
  static validateContext(
    template: NotificationTemplate,
    context: NotificationContext,
  ): string[] {
    const missingVars: string[] = [];
    const requiredVars = this.extractVariables(template);

    for (const varName of requiredVars) {
      if (context[varName as keyof NotificationContext] === undefined) {
        missingVars.push(varName);
      }
    }

    return missingVars;
  }

  /**
   * Extrai variáveis do template
   */
  private static extractVariables(template: NotificationTemplate): string[] {
    const variables = new Set<string>();
    const text = `${template.title} ${template.message}`;

    const matches = text.match(/\{(\w+)\}/g);
    if (matches) {
      matches.forEach((match) => {
        variables.add(match.slice(1, -1)); // Remove { }
      });
    }

    return Array.from(variables);
  }
}
