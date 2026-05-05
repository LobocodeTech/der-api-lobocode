import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Request,
  Body,
  UseGuards,
} from '@nestjs/common';
import { NotificationService } from './shared/notification.service';
import { PushNotificationService } from './shared/push-notification.service';
import { AuthGuard } from '../../shared/auth/guards/auth.guard';
import { NotificationFilters } from './shared/notification.types';
import { PushSubscriptionDto, UnsubscribePushDto } from './dto/push-subscription.dto';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationController {
  constructor(
    private notificationService: NotificationService,
    private pushNotificationService: PushNotificationService,
  ) {}

  /**
   * Buscar minhas notificações
   * GET /notifications?page=1&limit=20&isRead=false
   */
  @Get()
  async minhasNotificacoes(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('isRead') isRead?: string,
    @Query('entityType') entityType?: string,
  ) {
    const userId = req.user.id;
    const MAX_LIMIT = 200;

    const filters: NotificationFilters = {
      page: page ? parseInt(page) : 1,
      limit: Math.min(limit ? parseInt(limit) : 200, MAX_LIMIT),
      ...(isRead !== undefined && { isRead: isRead === 'true' }),
      ...(entityType && { entityType }),
    };

    return this.notificationService.buscarDoUsuario(userId, filters);
  }

  /**
   * Buscar notificações com filtro de pesquisa
   * GET /notifications/search?q=termo&page=1&limit=20
   * Quando há query de busca, pesquisa em TODA a base (sem limite de 200)
   */
  @Get('search')
  async buscarNotificacoes(
    @Request() req: any,
    @Query('q') query?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('isRead') isRead?: string,
    @Query('entityType') entityType?: string,
  ) {
    const userId = req.user.id;
    const searchQuery = query?.trim() || undefined;

    // Se há busca, não aplicar limite (busca em toda a base)
    // Se não há busca, aplicar limite de 200
    const filters: NotificationFilters = {
      page: page ? parseInt(page) : 1,
      limit: searchQuery ? undefined : 200, // Sem limite quando busca
      query: searchQuery,
      ...(isRead !== undefined && { isRead: isRead === 'true' }),
      ...(entityType && { entityType }),
    };

    return this.notificationService.buscarDoUsuario(userId, filters);
  }

  /**
   * Contar não lidas
   * GET /notifications/unread-count
   */
  @Get('unread-count')
  async contarNaoLidas(@Request() req: any) {
    const userId = req.user.id;
    const count = await this.notificationService.contarNaoLidas(userId);

    return { count };
  }

  /**
   * Marcar como lida
   * PUT /notifications/:id/read
   */
  @Put(':id/read')
  async marcarComoLida(
    @Param('id') notificationId: string,
    @Request() req: any,
  ) {
    const userId = req.user.id;
    await this.notificationService.marcarComoLida(notificationId, userId);

    return { success: true };
  }

  /**
   * Marcar todas como lidas
   * PUT /notifications/read-all
   */
  @Put('read-all')
  async marcarTodasComoLidas(@Request() req: any) {
    const userId = req.user.id;
    await this.notificationService.marcarTodasComoLidas(userId);

    return { success: true };
  }

  /**
   * Deletar notificação
   * DELETE /notifications/:id
   */
  @Delete(':id')
  async deletarNotificacao(
    @Param('id') notificationId: string,
    @Request() req: any,
  ) {
    const userId = req.user.id;
    await this.notificationService.deletarNotificacao(notificationId, userId);

    return { success: true };
  }

  /**
   * Inscrever-se em push notifications
   * POST /notifications/push/subscribe
   */
  @Post('push/subscribe')
  async subscribePush(
    @Request() req: any,
    @Body() dto: PushSubscriptionDto,
  ) {
    const userId = req.user.id;
    await this.pushNotificationService.subscribe(userId, dto);
    return { success: true };
  }

  /**
   * Desinscrever-se de push notifications
   * POST /notifications/push/unsubscribe
   */
  @Post('push/unsubscribe')
  async unsubscribePush(
    @Request() req: any,
    @Body() dto: UnsubscribePushDto,
  ) {
    const userId = req.user.id;
    await this.pushNotificationService.unsubscribe(userId, dto.endpoint);
    return { success: true };
  }

  /**
   * Enviar notificação de teste
   * POST /notifications/push/test
   * Body: { title?: string, body?: string, userId?: string }
   */
  @Post('push/test')
  async testPushNotification(
    @Request() req: any,
    @Body() body?: { title?: string; body?: string; userId?: string },
  ) {
    const userId = body?.userId || req.user.id;
    const title = body?.title || '🧪 Teste de Push Notification';
    const message = body?.body || `Teste enviado em ${new Date().toLocaleString('pt-BR')} - Se você viu isso, está funcionando! 🎉`;

    await this.pushNotificationService.sendPushNotification(userId, {
      title,
      body: message,
      data: {
        url: '/notifications',
        notificationId: 'test-' + Date.now(),
      },
    });

    return { 
      success: true, 
      message: 'Push notification de teste enviada',
      details: {
        userId,
        title,
        body: message,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Retorna VAPID public key para registro do Push no frontend
   * GET /notifications/push/vapid-public-key
   */
  @Get('push/vapid-public-key')
  getVapidPublicKey() {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY || null,
    };
  }
}
