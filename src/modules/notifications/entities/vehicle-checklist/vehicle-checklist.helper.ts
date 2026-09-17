/**
 * 🔔 HELPER - VEHICLE CHECKLIST
 *
 * Helper específico para notificações de checklist de veículos.
 * Usa templates contextuais e sistema de destinatários inteligente.
 */

import { Injectable } from '@nestjs/common';
import { NotificationService } from '../../shared/notification.service';
import { VehicleChecklistContextBuilder } from './vehicle-checklist.context-builder';
import { NotificationRecipientsService } from '../../shared/notification.recipients';
import { VehicleChecklistTemplateService } from './vehicle-checklist.templates';

@Injectable()
export class VehicleChecklistNotificationHelper {
  constructor(
    private notificationService: NotificationService,
    private contextBuilder: VehicleChecklistContextBuilder,
    private recipientsService: NotificationRecipientsService,
  ) {}

  /**
   * 🚗 VEHICLE CHECKLIST CRIADO - Versão melhorada com templates
   */
  async vehicleChecklistCriado(
    checklistId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildVehicleChecklistContext(
        checklistId,
        'created',
      );

      // 2. Obter template
      const template = VehicleChecklistTemplateService.getTemplate('created');
      if (!template) {
        throw new Error(
          'Template não encontrado para vehicleChecklist.created',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = VehicleChecklistTemplateService.renderTemplate(
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
        entityType: 'vehicleChecklist',
        entityId: checklistId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de vehicleChecklist criado:',
        error,
      );
      throw error;
    }
  }

  /**
   * 🚗 VEHICLE CHECKLIST ATUALIZADO - Versão melhorada com templates
   */
  async vehicleChecklistAtualizado(
    checklistId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildVehicleChecklistContext(
        checklistId,
        'updated',
      );

      // 2. Obter template
      const template = VehicleChecklistTemplateService.getTemplate('updated');
      if (!template) {
        throw new Error(
          'Template não encontrado para vehicleChecklist.updated',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = VehicleChecklistTemplateService.renderTemplate(
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
        entityType: 'vehicleChecklist',
        entityId: checklistId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de vehicleChecklist atualizado:',
        error,
      );
      throw error;
    }
  }

  /**
   * 🚗 VEHICLE CHECKLIST FINALIZADO - Versão melhorada com templates
   */
  async vehicleChecklistFinalizado(
    checklistId: string,
    criadoPorUserId: string,
    companyId: string,
  ) {
    try {
      // 1. Construir contexto rico
      const context = await this.contextBuilder.buildVehicleChecklistContext(
        checklistId,
        'completed',
      );

      // 2. Obter template
      const template = VehicleChecklistTemplateService.getTemplate('completed');
      if (!template) {
        throw new Error(
          'Template não encontrado para vehicleChecklist.completed',
        );
      }

      // 3. Renderizar template com contexto
      const renderedTemplate = VehicleChecklistTemplateService.renderTemplate(
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
        entityType: 'vehicleChecklist',
        entityId: checklistId,
        userId: criadoPorUserId,
        companyId,
        priority: renderedTemplate.priority,
        recipients,
      });
    } catch (error) {
      console.error(
        'Erro ao criar notificação de vehicleChecklist finalizado:',
        error,
      );
      throw error;
    }
  }
}
