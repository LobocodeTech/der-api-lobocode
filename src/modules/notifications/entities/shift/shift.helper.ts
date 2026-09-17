/**
 * 🔔 HELPER - SHIFT
 *
 * Helper específico para notificações de turnos.
 * Usa templates contextuais e sistema de destinatários inteligente.
 */

import { Injectable } from '@nestjs/common';
import { NotificationService } from '../../shared/notification.service';
import { ShiftContextBuilder } from './shift.context-builder';
import { NotificationRecipientsService } from '../../shared/notification.recipients';
import { ShiftTemplateService } from './shift.templates';
import { CreateNotificationData } from '../../shared/notification.types';

@Injectable()
export class ShiftNotificationHelper {
  constructor(
    private notificationService: NotificationService,
    private contextBuilder: ShiftContextBuilder,
    private recipientsService: NotificationRecipientsService,
  ) {}

  /**
   * 🕐 TURNO INICIADO - Versão melhorada com templates
   */
  async turnoIniciado(
    turnoId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildShiftContext(
        turnoId,
        'started',
      );

      // 2. Obter template
      const template = ShiftTemplateService.getTemplate('started');
      if (!template) {
        throw new Error('Template não encontrado para shift.started');
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = ShiftTemplateService.renderTemplate(
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
        entityType: 'shift',
        entityId: turnoId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error('Erro ao criar notificação de turno iniciado:', error);
      throw error;
    }
  }

  /**
   * 🕐 TURNO FINALIZADO - Versão melhorada com templates
   */
  async turnoFinalizado(
    turnoId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildShiftContext(
        turnoId,
        'finished',
      );

      // 2. Obter template
      const template = ShiftTemplateService.getTemplate('finished');
      if (!template) {
        throw new Error('Template não encontrado para shift.finished');
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = ShiftTemplateService.renderTemplate(
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
        entityType: 'shift',
        entityId: turnoId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error('Erro ao criar notificação de turno finalizado:', error);
      throw error;
    }
  }

  /**
   * 🕐 TURNO EM INTERVALO - Versão melhorada com templates
   */
  async turnoEmIntervalo(
    turnoId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildShiftContext(
        turnoId,
        'break_started',
      );

      // 2. Obter template
      const template = ShiftTemplateService.getTemplate('break_started');
      if (!template) {
        throw new Error('Template não encontrado para shift.break_started');
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = ShiftTemplateService.renderTemplate(
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
        entityType: 'shift',
        entityId: turnoId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error('Erro ao criar notificação de turno em intervalo:', error);
      throw error;
    }
  }

  /**
   * 🕐 INTERVALO FINALIZADO - Versão melhorada com templates
   */
  async intervaloFinalizado(
    turnoId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildShiftContext(
        turnoId,
        'break_finished',
      );

      // 2. Obter template
      const template = ShiftTemplateService.getTemplate('break_finished');
      if (!template) {
        throw new Error('Template não encontrado para shift.break_finished');
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = ShiftTemplateService.renderTemplate(
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
        entityType: 'shift',
        entityId: turnoId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de intervalo finalizado:',
        error,
      );
      throw error;
    }
  }
}
