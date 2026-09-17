/**
 * 🚛 TEMPLATES DE NOTIFICAÇÃO - MOTORIZED SERVICE
 *
 * Templates específicos para serviços motorizados.
 * Focado em empresa de segurança com informações contextuais.
 */

import {
  NotificationTemplate,
  NotificationContext,
} from '../../shared/notification.types';

/**
 * 🚛 TEMPLATES PARA MOTORIZED SERVICE
 */
export const MOTORIZED_SERVICE_TEMPLATES: Record<string, NotificationTemplate> =
  {
    created: {
      title: 'Novo Serviço Motorizado',
      message: '{userName} criou serviço motorizado{postName} às {time}',
      priority: 'NORMAL',
      recipients: 'ACTIVE_SUPERVISORS_AND_ADMINS', // Supervisores ativos + admins
    },
    updated: {
      title: 'Serviço Motorizado Atualizado',
      message: '{userName} atualizou serviço motorizado{postName} às {time}',
      priority: 'NORMAL',
      recipients: 'ACTIVE_SUPERVISORS_AND_ADMINS', // Supervisores ativos + admins
    },
    completed: {
      title: 'Serviço Motorizado Concluído',
      message: '{userName} concluiu serviço motorizado{postName} às {time}',
      priority: 'NORMAL',
      recipients: 'ACTIVE_SUPERVISORS_AND_ADMINS', // Supervisores ativos + admins
    },
  };

/**
 * 🔧 MOTORIZED SERVICE TEMPLATE SERVICE
 */
export class MotorizedServiceTemplateService {
  /**
   * Obtém template por operação
   */
  static getTemplate(operation: string): NotificationTemplate | null {
    const template = MOTORIZED_SERVICE_TEMPLATES[operation];
    if (!template) {
      console.warn(
        `Template não encontrado para operação: motorizedService.${operation}`,
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
