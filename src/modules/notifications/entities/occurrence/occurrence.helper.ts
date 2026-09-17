/**
 * 🔔 HELPER - OCCURRENCE
 *
 * Helper específico para notificações de ocorrências.
 * Usa templates contextuais e sistema de destinatários inteligente.
 */

import { Injectable } from '@nestjs/common';
import { NotificationService } from '../../shared/notification.service';
import { OccurrenceContextBuilder } from './occurrence.context-builder';
import { NotificationRecipientsService } from '../../shared/notification.recipients';
import { OccurrenceTemplateService } from './occurrence.templates';

@Injectable()
export class OccurrenceNotificationHelper {
  constructor(
    private notificationService: NotificationService,
    private contextBuilder: OccurrenceContextBuilder,
    private recipientsService: NotificationRecipientsService,
  ) {}

  /**
   * 🚨 OCCURRENCE CRIADA - Versão melhorada com templates
   */
  async occurrenceCriada(
    occurrenceId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildOccurrenceContext(
        occurrenceId,
        'created',
      );

      // 2. Obter template
      const template = OccurrenceTemplateService.getTemplate('created');
      if (!template) {
        throw new Error('Template não encontrado para occurrence.created');
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = OccurrenceTemplateService.renderTemplate(
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
        entityType: 'occurrence',
        entityId: occurrenceId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error('Erro ao criar notificação de occurrence criada:', error);
      throw error;
    }
  }

  /**
   * 🚨 OCCURRENCE ATUALIZADA - Versão melhorada com templates
   */
  async occurrenceAtualizada(
    occurrenceId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildOccurrenceContext(
        occurrenceId,
        'updated',
      );

      // 2. Obter template
      const template = OccurrenceTemplateService.getTemplate('updated');
      if (!template) {
        throw new Error('Template não encontrado para occurrence.updated');
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = OccurrenceTemplateService.renderTemplate(
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
        entityType: 'occurrence',
        entityId: occurrenceId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de occurrence atualizada:',
        error,
      );
      throw error;
    }
  }

  /**
   * 🚨 OCCURRENCE RESOLVIDA - Versão melhorada com templates
   */
  async occurrenceResolvida(
    occurrenceId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildOccurrenceContext(
        occurrenceId,
        'resolved',
      );

      // 2. Obter template
      const template = OccurrenceTemplateService.getTemplate('resolved');
      if (!template) {
        throw new Error('Template não encontrado para occurrence.resolved');
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = OccurrenceTemplateService.renderTemplate(
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
        entityType: 'occurrence',
        entityId: occurrenceId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de occurrence resolvida:',
        error,
      );
      throw error;
    }
  }
}
