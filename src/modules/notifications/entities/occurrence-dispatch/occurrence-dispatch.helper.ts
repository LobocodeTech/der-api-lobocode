/**
 * 🔔 HELPER - OCCURRENCE DISPATCH
 *
 * Helper específico para notificações de despacho de ocorrências.
 * Usa templates contextuais e sistema de destinatários inteligente.
 */

import { Injectable } from '@nestjs/common';
import { NotificationService } from '../../shared/notification.service';
import { OccurrenceDispatchContextBuilder } from './occurrence-dispatch.context-builder';
import { NotificationRecipientsService } from '../../shared/notification.recipients';
import { OccurrenceDispatchTemplateService } from './occurrence-dispatch.templates';

@Injectable()
export class OccurrenceDispatchNotificationHelper {
  constructor(
    private notificationService: NotificationService,
    private contextBuilder: OccurrenceDispatchContextBuilder,
    private recipientsService: NotificationRecipientsService,
  ) {}

  /**
   * 🚨 OCCURRENCE DISPATCH CRIADO - Versão melhorada com templates
   */
  async occurrenceDispatchCriado(
    dispatchId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildOccurrenceDispatchContext(
        dispatchId,
        'created',
      );

      // 2. Obter template
      const template = OccurrenceDispatchTemplateService.getTemplate('created');
      if (!template) {
        throw new Error(
          'Template não encontrado para occurrenceDispatch.created',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = OccurrenceDispatchTemplateService.renderTemplate(
        template,
        context,
      );

      // 4. Obter destinatários
      console.log('🔍 DEBUG - OccurrenceDispatch Context:', {
        guardId: context.guardId,
        recipientType: template.recipients,
        companyId,
      });

      const recipients = await this.recipientsService.getRecipients(
        companyId,
        template.recipients,
        { type: template.recipients, guardId: context.guardId },
      );

      console.log('🎯 DEBUG - Recipients encontrados:', recipients);

      // 5. Criar notificação
      return this.notificationService.criar({
        title: renderedTemplate.title,
        message: renderedTemplate.message,
        entityType: 'occurrenceDispatch',
        entityId: dispatchId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de occurrenceDispatch criado:',
        error,
      );
      throw error;
    }
  }

  /**
   * 🚨 OCCURRENCE DISPATCH ATUALIZADO - Versão melhorada com templates
   */
  async occurrenceDispatchAtualizado(
    dispatchId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildOccurrenceDispatchContext(
        dispatchId,
        'updated',
      );

      // 2. Obter template
      const template = OccurrenceDispatchTemplateService.getTemplate('updated');
      if (!template) {
        throw new Error(
          'Template não encontrado para occurrenceDispatch.updated',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = OccurrenceDispatchTemplateService.renderTemplate(
        template,
        context,
      );

      // 4. Obter destinatários
      const recipients = await this.recipientsService.getRecipients(
        companyId,
        template.recipients,
        { type: template.recipients, guardId: context.guardId },
      );

      // 5. Criar notificação
      return this.notificationService.criar({
        title: renderedTemplate.title,
        message: renderedTemplate.message,
        entityType: 'occurrenceDispatch',
        entityId: dispatchId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de occurrenceDispatch atualizado:',
        error,
      );
      throw error;
    }
  }

  /**
   * 🚨 OCCURRENCE DISPATCH FINALIZADO - Versão melhorada com templates
   */
  async occurrenceDispatchFinalizado(
    dispatchId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildOccurrenceDispatchContext(
        dispatchId,
        'completed',
      );

      // 2. Obter template
      const template =
        OccurrenceDispatchTemplateService.getTemplate('completed');
      if (!template) {
        throw new Error(
          'Template não encontrado para occurrenceDispatch.completed',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = OccurrenceDispatchTemplateService.renderTemplate(
        template,
        context,
      );

      // 4. Obter destinatários
      const recipients = await this.recipientsService.getRecipients(
        companyId,
        template.recipients,
        { type: template.recipients, guardId: context.guardId },
      );

      // 5. Criar notificação
      return this.notificationService.criar({
        title: renderedTemplate.title,
        message: renderedTemplate.message,
        entityType: 'occurrenceDispatch',
        entityId: dispatchId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de occurrenceDispatch finalizado:',
        error,
      );
      throw error;
    }
  }
}
