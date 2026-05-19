import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EmailService } from '../../../shared/auth/services/email.service';
import { PushNotificationService } from './push-notification.service';
import { NotificationGateway } from '../notification.gateway';
import { NotificationResponse } from './notification.types';

function resolvePushUrl(notification: NotificationResponse): string {
  const entityType = notification.entityType ?? '';
  const entityId = notification.entityId;

  if (
    (entityType === 'work-order' || entityType === 'work-order-unassignment') &&
    entityId
  ) {
    return `/work-orders?id=${encodeURIComponent(entityId)}`;
  }
  if (
    (entityType === 'planning' || entityType === 'planning-unassignment') &&
    entityId
  ) {
    const id = encodeURIComponent(entityId);
    return `/schedule?tab=planning&planningId=${id}`;
  }
  return '/notifications';
}

@Injectable()
export class NotificationChannelDeliveryService {
  private readonly logger = new Logger(NotificationChannelDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async entregar(
    notification: NotificationResponse,
    targetUserIds: string[],
    companyId?: string,
  ): Promise<void> {
    // Sempre envia in-app (WebSocket + contador), independentemente das preferências de push/email.
    await this.notificationGateway.enviarParaUsuarios(targetUserIds, notification);
    if (companyId) {
      await this.notificationGateway.enviarParaSala(
        `company_${companyId}`,
        notification,
      );
    }

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: targetUserIds },
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        notificationEmail: true,
        notificationPushNotification: true,
      },
    });

    const pushRecipients = users
      .filter((u) => u.notificationPushNotification)
      .map((u) => u.id);
    const emailRecipients = users.filter((u) => u.notificationEmail);

    if (pushRecipients.length > 0) {
      const pushUrl = resolvePushUrl(notification);
      await this.pushNotificationService.sendPushNotificationToUsers(
        pushRecipients,
        {
          title: notification.title,
          body: notification.message,
          icon: '/src/assets/der-logo.png',
          badge: '/src/assets/der-logo.png',
          data: {
            entityType: notification.entityType,
            entityId: notification.entityId,
            notificationId: notification.id,
            url: pushUrl,
          },
        },
      );
    } else {
      this.logger.debug(
        'Nenhum destinatário com push ativo; envio push ignorado.',
      );
    }

    await Promise.all(
      emailRecipients.map((recipient) =>
        this.emailService.sendNotificationEmail(
          recipient.email,
          recipient.name,
          notification.title,
          notification.message,
        ),
      ),
    );

    for (const userId of targetUserIds) {
      await this.notificationGateway.atualizarContadorNaoLidas(userId);
    }
  }
}
