import { Injectable, Inject, forwardRef, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  CreateNotificationData,
  NotificationResponse,
  NotificationFilters,
} from './notification.types';
import { NotificationGateway } from '../notification.gateway';
import { NotificationChannelDeliveryService } from './notification-channel-delivery.service';
import { WorkOrderNotificationScopeService } from '../../../shared/regional-scope/work-order-notification-scope.service';
import { Roles, User } from '@prisma/client';

@Injectable()
export class NotificationService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => NotificationGateway))
    private notificationGateway: NotificationGateway,
    private readonly notificationChannelDeliveryService: NotificationChannelDeliveryService,
    private readonly workOrderNotificationScopeService: WorkOrderNotificationScopeService,
  ) {}

  // ============================================================================
  // 📢 CRIAR NOTIFICAÇÃO
  // ============================================================================

  /**
   * Criar uma notificação simples
   */
  async criar(data: CreateNotificationData): Promise<NotificationResponse | null> {
    const hasExplicitRecipients =
      Array.isArray(data.recipients) && data.recipients.length > 0;

    // 1. Destinatários explícitos (ex.: atribuição de OS) ou broadcast para gestores
    let targetUserIds = hasExplicitRecipients
      ? [...data.recipients!]
      : await this.obterDestinatarios(data.companyId);

    // 2. Em broadcast automático, o autor não recebe a própria notificação.
    // Com destinatários explícitos, não removemos o autor: atribuição a si mesmo
    // ou ao mesmo usuário da ação ainda deve gerar in-app + push.
    if (!hasExplicitRecipients) {
      targetUserIds = targetUserIds.filter((userId) => userId !== data.userId);
    }

    // 3. Se não há destinatários após filtrar, não criar notificação
    if (targetUserIds.length === 0) {
      return null;
    }

    // 4. Criar a notificação no banco
    const notification = await this.prisma.notification.create({
      data: {
        title: data.title,
        message: data.message,
        entityType: data.entityType,
        entityId: data.entityId,
        createdByUserId: data.userId,
        companyId: data.companyId,
      },
    });

    // 5. Criar registros para cada destinatário
    await this.criarNotificacaoParaUsuarios(notification.id, targetUserIds);

    // 6. Preparar resposta
    const notificationResponse = {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType || undefined,
      entityId: notification.entityId || undefined,
      isRead: false,
      createdAt: notification.createdAt,
    };

    // 7. Enviar notificação em tempo real para usuários conectados
    await this.enviarNotificacaoTempoReal(
      notificationResponse,
      targetUserIds,
      data.companyId,
    );

    return notificationResponse;
  }

  // ============================================================================
  // 📋 BUSCAR NOTIFICAÇÕES DO USUÁRIO
  // ============================================================================

  /**
   * Buscar notificações de um usuário
   * - Sem busca: limite de 200 notificações
   * - Com busca: sem limite (pesquisa em toda a base)
   * Suporta busca por termo (query) em título, mensagem e entityType
   */
  async buscarDoUsuario(
    userId: string,
    filters: NotificationFilters = {},
    usuario?: Pick<User, 'id' | 'role' | 'regionalId' | 'companyId'>,
  ): Promise<{ notifications: NotificationResponse[]; total: number }> {
    const page = filters.page || 1;
    const hasSearchQuery = filters.query && filters.query.trim();
    
    // Se tem busca, não aplica limite. Se não tem, aplica limite de 200
    const limit = hasSearchQuery ? undefined : Math.min(filters.limit || 200, 200);
    const skip = limit ? (page - 1) * limit : 0;

    const escopoOs =
      usuario?.role === Roles.FIELD_TEAM
        ? await this.workOrderNotificationScopeService.buscarIdsOsVisiveisParaUsuario(
            usuario,
          )
        : null;

    // Construir where clause base
    const baseWhere: any = {
      recipients: {
        some: {
          userId,
          ...(filters.isRead !== undefined && { isRead: filters.isRead }),
        },
      },
      ...(filters.entityType && { entityType: filters.entityType }),
      ...(escopoOs !== null &&
        this.workOrderNotificationScopeService.construirWhereNotificacoesOsFieldTeam(
          usuario!,
          escopoOs,
        )),
    };

    // Adicionar busca por termo se fornecido
    let where = baseWhere;
    if (hasSearchQuery) {
      const searchTerm = filters.query!.trim();
      where = {
        ...baseWhere,
        OR: [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          { message: { contains: searchTerm, mode: 'insensitive' } },
          { entityType: { contains: searchTerm, mode: 'insensitive' } },
        ],
      };
    }

    // Query options - take é opcional (undefined = sem limite)
    const queryOptions: any = {
      where,
      skip,
      orderBy: { createdAt: 'desc' },
      include: {
        recipients: {
          where: { userId },
          select: { isRead: true },
        },
      },
    };
    
    // Só adicionar take se tiver limite
    if (limit) {
      queryOptions.take = limit;
    }

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany(queryOptions) as unknown as Promise<Array<{
        id: string;
        title: string;
        message: string;
        entityType: string | null;
        entityId: string | null;
        createdAt: Date;
        recipients: { isRead: boolean }[];
      }>>,
      this.prisma.notification.count({ where }),
    ]);

    return {
      notifications: notifications.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        entityType: n.entityType || undefined,
        entityId: n.entityId || undefined,
        isRead: n.recipients[0]?.isRead || false,
        createdAt: n.createdAt,
      })),
      total,
    };
  }

  /**
   * Contar notificações não lidas (das últimas 200)
   */
  async contarNaoLidas(
    userId: string,
    usuario?: Pick<User, 'id' | 'role' | 'regionalId' | 'companyId'>,
  ): Promise<number> {
    const MAX_LIMIT = 200;

    const escopoOs =
      usuario?.role === Roles.FIELD_TEAM
        ? await this.workOrderNotificationScopeService.buscarIdsOsVisiveisParaUsuario(
            usuario,
          )
        : null;

    const filtroOs =
      escopoOs !== null
        ? this.workOrderNotificationScopeService.construirWhereNotificacoesOsFieldTeam(
            usuario!,
            escopoOs,
          )
        : {};

    // Buscar as últimas 200 notificações do usuário
    const ultimasNotificacoes = await this.prisma.notificationRecipient.findMany({
      where: {
        userId,
        notification: filtroOs,
      },
      orderBy: { notification: { createdAt: 'desc' } },
      take: MAX_LIMIT,
      select: { isRead: true },
    });

    // Contar quantas não foram lidas
    return ultimasNotificacoes.filter(n => !n.isRead).length;
  }

  /**
   * Marcar notificação como lida
   */
  async marcarComoLida(notificationId: string, userId: string): Promise<void> {
    // Verificar se a notificação pertence ao usuário
    const notificationRecipient = await this.prisma.notificationRecipient.findFirst({
      where: {
        notificationId,
        userId,
      },
    });

    if (!notificationRecipient) {
      throw new NotFoundException('Notificação não encontrada ou não pertence ao usuário');
    }

    await this.prisma.notificationRecipient.updateMany({
      where: {
        notificationId,
        userId,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Marcar todas as notificações como lidas
   */
  async marcarTodasComoLidas(userId: string): Promise<void> {
    await this.prisma.notificationRecipient.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Deletar notificação (apenas para o usuário específico)
   */
  async deletarNotificacao(notificationId: string, userId: string): Promise<void> {
    // Verificar se a notificação pertence ao usuário
    const notificationRecipient = await this.prisma.notificationRecipient.findFirst({
      where: {
        notificationId,
        userId,
      },
    });

    if (!notificationRecipient) {
      throw new NotFoundException('Notificação não encontrada ou não pertence ao usuário');
    }

    // Deletar apenas o registro do usuário específico
    await this.prisma.notificationRecipient.delete({
      where: {
        id: notificationRecipient.id,
      },
    });
  }

  // ============================================================================
  // 🔧 MÉTODOS PRIVADOS
  // ============================================================================

  /**
   * Obter destinatários (managers e supervisors da empresa)
   */
  private async obterDestinatarios(companyId?: string): Promise<string[]> {
    const where: any = {
      role: { in: ['ADMIN', 'SUPERVISOR'] },
      deletedAt: null,
    };

    if (companyId) {
      where.companyId = companyId;
    }

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true },
    });

    return users.map((user) => user.id);
  }

  /**
   * Criar registros de notificação para usuários
   */
  private async criarNotificacaoParaUsuarios(
    notificationId: string,
    userIds: string[],
  ): Promise<void> {
    if (userIds.length === 0) return;

    await this.prisma.notificationRecipient.createMany({
      data: userIds.map((userId) => ({
        notificationId,
        userId,
        isRead: false,
      })),
    });
  }

  // ============================================================================
  // 🔔 NOTIFICAÇÕES EM TEMPO REAL
  // ============================================================================

  /**
   * Enviar notificação em tempo real para usuários conectados
   */
  private async enviarNotificacaoTempoReal(
    notification: NotificationResponse,
    targetUserIds: string[],
    companyId?: string,
  ): Promise<void> {
    try {
      await this.notificationChannelDeliveryService.entregar(
        notification,
        targetUserIds,
        companyId,
      );
    } catch (error) {
      console.error('Erro ao enviar notificação em tempo real:', error);
    }
  }

  /**
   * Enviar notificação em tempo real para usuário específico
   */
  async enviarNotificacaoTempoRealParaUsuario(
    userId: string,
    notification: NotificationResponse,
  ): Promise<void> {
    await this.notificationGateway.enviarParaUsuario(userId, notification);
    await this.notificationGateway.atualizarContadorNaoLidas(userId);
  }

  /**
   * Enviar notificação em tempo real para sala específica
   */
  async enviarNotificacaoTempoRealParaSala(
    room: string,
    notification: NotificationResponse,
  ): Promise<void> {
    await this.notificationGateway.enviarParaSala(room, notification);
  }
}
