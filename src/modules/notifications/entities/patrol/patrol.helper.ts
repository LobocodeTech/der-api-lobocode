/**
 * 🚶 PATROL NOTIFICATION HELPER
 *
 * Helper específico para notificações de Rondas.
 * Integra com o sistema de templates e destinatários.
 */

import { Injectable } from '@nestjs/common';
import { NotificationService } from '../../shared/notification.service';
import { PatrolContextBuilder } from './patrol.context-builder';
import { NotificationRecipientsService } from '../../shared/notification.recipients';
import { PatrolTemplateService } from './patrol.templates';

@Injectable()
export class PatrolNotificationHelper {
  constructor(
    private notificationService: NotificationService,
    private contextBuilder: PatrolContextBuilder,
    private recipientsService: NotificationRecipientsService,
  ) {}

  /**
   * 🚶 PATROL INICIADA - Versão melhorada com templates
   */
  async patrolIniciada(
    patrolId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildPatrolContext(
        patrolId,
        'started',
      );

      // 2. Obter template
      const template = PatrolTemplateService.getTemplate('started');
      if (!template) {
        throw new Error('Template não encontrado para patrol.started');
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = PatrolTemplateService.renderTemplate(
        template,
        context,
      );

      // 4. Obter destinatários
      const recipients = await this.recipientsService.getRecipients(
        companyId,
        template.recipients,
        { type: template.recipients },
      );

      // 5. Criar notificação
      return this.notificationService.criar({
        title: renderedTemplate.title,
        message: renderedTemplate.message,
        entityType: 'patrol',
        entityId: patrolId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error('Erro ao criar notificação de patrol iniciada:', error);
      throw error;
    }
  }

  /**
   * 🚶 PATROL CONCLUÍDA - Versão melhorada com templates
   */
  async patrolConcluida(
    patrolId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildPatrolContext(
        patrolId,
        'completed',
      );

      // 2. Obter template
      const template = PatrolTemplateService.getTemplate('completed');
      if (!template) {
        throw new Error('Template não encontrado para patrol.completed');
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = PatrolTemplateService.renderTemplate(
        template,
        context,
      );

      // 4. Obter destinatários
      const recipients = await this.recipientsService.getRecipients(
        companyId,
        template.recipients,
        { type: template.recipients },
      );

      // 5. Criar notificação
      return this.notificationService.criar({
        title: renderedTemplate.title,
        message: renderedTemplate.message,
        entityType: 'patrol',
        entityId: patrolId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error('Erro ao criar notificação de patrol concluída:', error);
      throw error;
    }
  }

  /**
   * 🚶 PATROL CHECKPOINT ALCANÇADO - Versão melhorada com templates
   */
  async patrolCheckpointAlcancado(
    patrolId: string,
    checkpointName: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildPatrolCheckpointContext(
        patrolId,
        checkpointName,
        'checkpoint_reached',
      );

      // 2. Obter template
      const template = PatrolTemplateService.getTemplate('checkpoint_reached');
      if (!template) {
        throw new Error(
          'Template não encontrado para patrol.checkpoint_reached',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = PatrolTemplateService.renderTemplate(
        template,
        context,
      );

      // 4. Obter destinatários
      const recipients = await this.recipientsService.getRecipients(
        companyId,
        template.recipients,
        { type: template.recipients },
      );

      // 5. Criar notificação
      return this.notificationService.criar({
        title: renderedTemplate.title,
        message: renderedTemplate.message,
        entityType: 'patrol',
        entityId: patrolId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de checkpoint alcançado:',
        error,
      );
      throw error;
    }
  }

  /**
   * 🚶 PATROL CHECKPOINT PERDIDO - Versão melhorada com templates
   */
  async patrolCheckpointPerdido(
    patrolId: string,
    checkpointName: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildPatrolCheckpointContext(
        patrolId,
        checkpointName,
        'checkpoint_missed',
      );

      // 2. Obter template
      const template = PatrolTemplateService.getTemplate('checkpoint_missed');
      if (!template) {
        throw new Error(
          'Template não encontrado para patrol.checkpoint_missed',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = PatrolTemplateService.renderTemplate(
        template,
        context,
      );

      // 4. Obter destinatários
      const recipients = await this.recipientsService.getRecipients(
        companyId,
        template.recipients,
        { type: template.recipients },
      );

      // 5. Criar notificação
      return this.notificationService.criar({
        title: renderedTemplate.title,
        message: renderedTemplate.message,
        entityType: 'patrol',
        entityId: patrolId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error('Erro ao criar notificação de checkpoint perdido:', error);
      throw error;
    }
  }
}
