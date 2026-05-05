import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import * as webpush from 'web-push';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(private prisma: PrismaService) {
    // Configurar VAPID keys
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject =
      process.env.VAPID_SUBJECT ||
      'mailto:admin@departamento-estadual-rodovias.com';

    if (vapidPublicKey && vapidPrivateKey) {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
      this.logger.log('✅ VAPID keys configuradas');
    } else {
      this.logger.warn(
        '⚠️ VAPID keys não configuradas - push notifications não funcionarão',
      );
    }
  }

  /**
   * Salva subscription de um usuário
   */
  async subscribe(
    userId: string,
    subscriptionData: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    },
  ): Promise<void> {
    try {
      // Verificar se já existe subscription com este endpoint
      const existing = await this.prisma.pushSubscription.findUnique({
        where: { endpoint: subscriptionData.endpoint },
      });

      if (existing) {
        // Atualizar se for de outro usuário ou atualizar dados
        if (existing.userId !== userId) {
          await this.prisma.pushSubscription.update({
            where: { endpoint: subscriptionData.endpoint },
            data: {
              userId,
              p256dh: subscriptionData.keys.p256dh,
              auth: subscriptionData.keys.auth,
            },
          });
          this.logger.log(`Subscription atualizada para usuário ${userId}`);
        } else {
          // Atualizar apenas as chaves
          await this.prisma.pushSubscription.update({
            where: { endpoint: subscriptionData.endpoint },
            data: {
              p256dh: subscriptionData.keys.p256dh,
              auth: subscriptionData.keys.auth,
            },
          });
          this.logger.log(`Chaves atualizadas para subscription existente`);
        }
      } else {
        // Criar nova subscription
        await this.prisma.pushSubscription.create({
          data: {
            userId,
            endpoint: subscriptionData.endpoint,
            p256dh: subscriptionData.keys.p256dh,
            auth: subscriptionData.keys.auth,
          },
        });
        this.logger.log(`✅ Nova subscription criada para usuário ${userId}`);
      }
    } catch (error) {
      this.logger.error(
        `❌ Erro ao salvar subscription: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Remove subscription de um usuário
   */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    try {
      await this.prisma.pushSubscription.deleteMany({
        where: {
          userId,
          endpoint,
        },
      });

      this.logger.log(`✅ Subscription removida para usuário ${userId}`);
    } catch (error) {
      this.logger.error(
        `❌ Erro ao remover subscription: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Envia push notification para um usuário
   */
  async sendPushNotification(
    userId: string,
    notification: {
      title: string;
      body: string;
      icon?: string;
      badge?: string;
      data?: {
        entityType?: string;
        entityId?: string;
        notificationId?: string;
        url?: string;
      };
    },
  ): Promise<void> {
    try {
      this.logger.log(`📤 Enviando push notification para usuário ${userId}`);
      this.logger.debug(`📦 Notificação: ${notification.title}`);

      // Buscar todas as subscriptions do usuário
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { userId },
      });

      if (subscriptions.length === 0) {
        this.logger.debug(`⚠️ Usuário ${userId} não tem subscriptions`);
        return;
      }

      this.logger.log(
        `📱 Encontradas ${subscriptions.length} subscription(s) para o usuário`,
      );

      // Payload no formato Web Push (flat): o SW lê e chama showNotification.
      // Evitar formato FCM (notification/data) para entrega confiável em background.
      const url = notification.data?.url || '/notifications';
      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        icon: notification.icon || '/src/assets/der-logo.png',
        badge: notification.badge || '/src/assets/der-logo.png',
        url,
        timestamp: Date.now(),
        ...(notification.data && {
          entityType: notification.data.entityType,
          entityId: notification.data.entityId,
          notificationId: notification.data.notificationId,
        }),
      });

      // Enviar para cada subscription com configurações otimizadas
      const promises = subscriptions.map(async (sub) => {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          };

          // Opções de envio otimizadas
          const options = {
            TTL: 86400, // 24 horas (em segundos)
            urgency: 'high' as const, // high, normal, low, very-low
            timeout: 30000, // 30 segundos (em ms)
          };

          await webpush.sendNotification(pushSubscription, payload, options);
          this.logger.debug(
            `✅ Push enviado para ${sub.endpoint.substring(0, 50)}...`,
          );
        } catch (error: any) {
          // Se subscription inválida (410 Gone, 404 Not Found), remover do banco
          if (error.statusCode === 410 || error.statusCode === 404) {
            this.logger.warn(
              `⚠️ Subscription inválida (${error.statusCode}), removendo: ${sub.endpoint.substring(0, 50)}...`,
            );
            await this.prisma.pushSubscription.delete({
              where: { id: sub.id },
            });
          }
          // Se erro temporário (429 Too Many Requests, 503 Service Unavailable), logar mas não remover
          else if (error.statusCode === 429 || error.statusCode === 503) {
            this.logger.warn(
              `⚠️ Erro temporário (${error.statusCode}), tentará novamente depois: ${error.message}`,
            );
          }
          // Outros erros
          else {
            this.logger.error(
              `❌ Erro ao enviar push (${error.statusCode || 'unknown'}): ${error.message}`,
            );
          }
        }
      });

      await Promise.allSettled(promises);
    } catch (error) {
      this.logger.error(
        `❌ Erro ao enviar push notification: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Envia push notification para múltiplos usuários
   */
  async sendPushNotificationToUsers(
    userIds: string[],
    notification: {
      title: string;
      body: string;
      icon?: string;
      badge?: string;
      data?: {
        entityType?: string;
        entityId?: string;
        notificationId?: string;
        url?: string;
      };
    },
  ): Promise<void> {
    const promises = userIds.map((userId) =>
      this.sendPushNotification(userId, notification),
    );

    await Promise.allSettled(promises);
  }
}
