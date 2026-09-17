/**
 * 🔔 HELPER - ARMAMENT CHECKLIST
 *
 * Helper específico para notificações de checklist de armamento.
 * Usa templates contextuais e sistema de destinatários inteligente.
 */

import { Injectable } from '@nestjs/common';
import { NotificationService } from '../../shared/notification.service';
import { ArmamentChecklistContextBuilder } from './armament-checklist.context-builder';
import { NotificationRecipientsService } from '../../shared/notification.recipients';
import { ArmamentChecklistTemplateService } from './armament-checklist.templates';

@Injectable()
export class ArmamentChecklistNotificationHelper {
  constructor(
    private notificationService: NotificationService,
    private contextBuilder: ArmamentChecklistContextBuilder,
    private recipientsService: NotificationRecipientsService,
  ) {}

  /**
   * 🔫 ARMAMENT CHECKLIST CRIADO - Versão melhorada com templates
   */
  async armamentChecklistCriado(
    checklistId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildArmamentChecklistContext(
        checklistId,
        'created',
      );

      // 2. Obter template
      const template = ArmamentChecklistTemplateService.getTemplate('created');
      if (!template) {
        throw new Error(
          'Template não encontrado para armamentChecklist.created',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = ArmamentChecklistTemplateService.renderTemplate(
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
        entityType: 'armamentChecklist',
        entityId: checklistId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de armamentChecklist criado:',
        error,
      );
      throw error;
    }
  }

  /**
   * 🔫 ARMAMENT CHECKLIST ATUALIZADO - Versão melhorada com templates
   */
  async armamentChecklistAtualizado(
    checklistId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildArmamentChecklistContext(
        checklistId,
        'updated',
      );

      // 2. Obter template
      const template = ArmamentChecklistTemplateService.getTemplate('updated');
      if (!template) {
        throw new Error(
          'Template não encontrado para armamentChecklist.updated',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = ArmamentChecklistTemplateService.renderTemplate(
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
        entityType: 'armamentChecklist',
        entityId: checklistId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de armamentChecklist atualizado:',
        error,
      );
      throw error;
    }
  }

  /**
   * 🔫 ARMAMENT CHECKLIST FINALIZADO - Versão melhorada com templates
   */
  async armamentChecklistFinalizado(
    checklistId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildArmamentChecklistContext(
        checklistId,
        'completed',
      );

      // 2. Obter template
      const template =
        ArmamentChecklistTemplateService.getTemplate('completed');
      if (!template) {
        throw new Error(
          'Template não encontrado para armamentChecklist.completed',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = ArmamentChecklistTemplateService.renderTemplate(
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
        entityType: 'armamentChecklist',
        entityId: checklistId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de armamentChecklist finalizado:',
        error,
      );
      throw error;
    }
  }
}
