/**
 * 🔔 HELPER - DOORMAN CHECKLIST
 *
 * Helper específico para notificações de checklist de porteiro.
 * Usa templates contextuais e sistema de destinatários inteligente.
 */

import { Injectable } from '@nestjs/common';
import { NotificationService } from '../../shared/notification.service';
import { DoormanChecklistContextBuilder } from './doorman-checklist.context-builder';
import { NotificationRecipientsService } from '../../shared/notification.recipients';
import { DoormanChecklistTemplateService } from './doorman-checklist.templates';

@Injectable()
export class DoormanChecklistNotificationHelper {
  constructor(
    private notificationService: NotificationService,
    private contextBuilder: DoormanChecklistContextBuilder,
    private recipientsService: NotificationRecipientsService,
  ) {}

  /**
   * 🚪 DOORMAN CHECKLIST CRIADO - Versão melhorada com templates
   */
  async doormanChecklistCriado(
    checklistId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildDoormanChecklistContext(
        checklistId,
        'created',
      );

      // 2. Obter template
      const template = DoormanChecklistTemplateService.getTemplate('created');
      if (!template) {
        throw new Error(
          'Template não encontrado para doormanChecklist.created',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = DoormanChecklistTemplateService.renderTemplate(
        template,
        context,
      );

      // 4. Obter destinatários
      const recipients = await this.recipientsService.getRecipients(
        companyId,
        template.recipients,
      );

      // 5. Criar notificação
      return this.notificationService.criar({
        title: renderedTemplate.title,
        message: renderedTemplate.message,
        entityType: 'doormanChecklist',
        entityId: checklistId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de doormanChecklist criado:',
        error,
      );
      throw error;
    }
  }

  /**
   * 🚪 DOORMAN CHECKLIST ATUALIZADO - Versão melhorada com templates
   */
  async doormanChecklistAtualizado(
    checklistId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildDoormanChecklistContext(
        checklistId,
        'updated',
      );

      // 2. Obter template
      const template = DoormanChecklistTemplateService.getTemplate('updated');
      if (!template) {
        throw new Error(
          'Template não encontrado para doormanChecklist.updated',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = DoormanChecklistTemplateService.renderTemplate(
        template,
        context,
      );

      // 4. Obter destinatários
      const recipients = await this.recipientsService.getRecipients(
        companyId,
        template.recipients,
      );

      // 5. Criar notificação
      return this.notificationService.criar({
        title: renderedTemplate.title,
        message: renderedTemplate.message,
        entityType: 'doormanChecklist',
        entityId: checklistId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de doormanChecklist atualizado:',
        error,
      );
      throw error;
    }
  }

  /**
   * 🚪 DOORMAN CHECKLIST FINALIZADO - Versão melhorada com templates
   */
  async doormanChecklistFinalizado(
    checklistId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildDoormanChecklistContext(
        checklistId,
        'completed',
      );

      // 2. Obter template
      const template = DoormanChecklistTemplateService.getTemplate('completed');
      if (!template) {
        throw new Error(
          'Template não encontrado para doormanChecklist.completed',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = DoormanChecklistTemplateService.renderTemplate(
        template,
        context,
      );

      // 4. Obter destinatários
      const recipients = await this.recipientsService.getRecipients(
        companyId,
        template.recipients,
      );

      // 5. Criar notificação
      return this.notificationService.criar({
        title: renderedTemplate.title,
        message: renderedTemplate.message,
        entityType: 'doormanChecklist',
        entityId: checklistId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de doormanChecklist finalizado:',
        error,
      );
      throw error;
    }
  }
}
