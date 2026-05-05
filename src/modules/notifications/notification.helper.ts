import { Injectable } from '@nestjs/common';
import { NotificationService } from './shared/notification.service';

@Injectable()
export class NotificationHelper {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Notificação genérica para qualquer entidade
   */
  async entidadeCriada(
    entityType: string,
    entityId: string,
    titulo: string,
    criadoPorUserId: string,
    companyId?: string,
  ) {
    return this.notificationService.criar({
      title: `Novo(a) ${entityType} criado(a)`,
      message: titulo,
      entityType,
      entityId,
      userId: criadoPorUserId,
      companyId,
    });
  }

  /**
   * Notificação genérica para atualização
   */
  async entidadeAtualizada(
    entityType: string,
    entityId: string,
    titulo: string,
    criadoPorUserId: string,
    companyId?: string,
  ) {
    return this.notificationService.criar({
      title: `${entityType} atualizado(a)`,
      message: titulo,
      entityType,
      entityId,
      userId: criadoPorUserId,
      companyId,
    });
  }

  /**
   * Método genérico para qualquer notificação
   */
  async notificar(
    titulo: string,
    mensagem: string,
    criadoPorUserId: string,
    companyId?: string,
    entityType?: string,
    entityId?: string,
  ) {
    return this.notificationService.criar({
      title: titulo,
      message: mensagem,
      entityType,
      entityId,
      userId: criadoPorUserId,
      companyId,
    });
  }

  /**
   * Notificar usuários específicos
   * Cria uma única notificação com todos os recipients especificados
   */
  async notificarUsuarios(
    userIds: string[],
    titulo: string,
    mensagem: string,
    entityType: string,
    entityId: string,
    criadoPorUserId: string,
    companyId?: string,
  ) {
    if (!userIds || userIds.length === 0) {
      return null;
    }

    return this.notificationService.criar({
      title: titulo,
      message: mensagem,
      entityType,
      entityId,
      userId: criadoPorUserId,
      companyId,
      recipients: userIds, // Passar os recipients específicos
    });
  }
}