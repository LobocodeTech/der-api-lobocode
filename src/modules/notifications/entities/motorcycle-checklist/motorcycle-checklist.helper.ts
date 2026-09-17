/**
 * 🔔 HELPER - MOTORCYCLE CHECKLIST
 *
 * Helper específico para notificações de checklist de motocicletas.
 * Usa templates contextuais e sistema de destinatários inteligente.
 */

import { Injectable } from '@nestjs/common';
import { NotificationService } from '../../shared/notification.service';
import { MotorcycleChecklistContextBuilder } from './motorcycle-checklist.context-builder';
import { NotificationRecipientsService } from '../../shared/notification.recipients';
import { MotorcycleChecklistTemplateService } from './motorcycle-checklist.templates';

@Injectable()
export class MotorcycleChecklistNotificationHelper {
  constructor(
    private notificationService: NotificationService,
    private contextBuilder: MotorcycleChecklistContextBuilder,
    private recipientsService: NotificationRecipientsService,
  ) {}

  /**
   * 🏍️ MOTORCYCLE CHECKLIST CRIADO - Versão melhorada com templates
   */
  async motorcycleChecklistCriado(
    checklistId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildMotorcycleChecklistContext(
        checklistId,
        'created',
      );

      // 2. Obter template
      const template =
        MotorcycleChecklistTemplateService.getTemplate('created');
      if (!template) {
        throw new Error(
          'Template não encontrado para motorcycleChecklist.created',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate =
        MotorcycleChecklistTemplateService.renderTemplate(template, context);

      // 4. Obter destinatários
      const recipients = await this.recipientsService.getRecipients(
        companyId,
        template.recipients,
      );

      // 5. Criar notificação
      return this.notificationService.criar({
        title: renderedTemplate.title,
        message: renderedTemplate.message,
        entityType: 'motorcycleChecklist',
        entityId: checklistId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de motorcycleChecklist criado:',
        error,
      );
      throw error;
    }
  }

  /**
   * 🏍️ MOTORCYCLE CHECKLIST ATUALIZADO - Versão melhorada com templates
   */
  async motorcycleChecklistAtualizado(
    checklistId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildMotorcycleChecklistContext(
        checklistId,
        'updated',
      );

      // 2. Obter template
      const template =
        MotorcycleChecklistTemplateService.getTemplate('updated');
      if (!template) {
        throw new Error(
          'Template não encontrado para motorcycleChecklist.updated',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate =
        MotorcycleChecklistTemplateService.renderTemplate(template, context);

      // 4. Obter destinatários
      const recipients = await this.recipientsService.getRecipients(
        companyId,
        template.recipients,
      );

      // 5. Criar notificação
      return this.notificationService.criar({
        title: renderedTemplate.title,
        message: renderedTemplate.message,
        entityType: 'motorcycleChecklist',
        entityId: checklistId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de motorcycleChecklist atualizado:',
        error,
      );
      throw error;
    }
  }

  /**
   * 🏍️ MOTORCYCLE CHECKLIST FINALIZADO - Versão melhorada com templates
   */
  async motorcycleChecklistFinalizado(
    checklistId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildMotorcycleChecklistContext(
        checklistId,
        'completed',
      );

      // 2. Obter template
      const template =
        MotorcycleChecklistTemplateService.getTemplate('completed');
      if (!template) {
        throw new Error(
          'Template não encontrado para motorcycleChecklist.completed',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate =
        MotorcycleChecklistTemplateService.renderTemplate(template, context);

      // 4. Obter destinatários
      const recipients = await this.recipientsService.getRecipients(
        companyId,
        template.recipients,
      );

      // 5. Criar notificação
      return this.notificationService.criar({
        title: renderedTemplate.title,
        message: renderedTemplate.message,
        entityType: 'motorcycleChecklist',
        entityId: checklistId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de motorcycleChecklist finalizado:',
        error,
      );
      throw error;
    }
  }
}
