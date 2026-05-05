import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { NotificationService } from './shared/notification.service';
import { PushNotificationService } from './shared/push-notification.service';
import { NotificationController } from './notification.controller';
import { NotificationHelper } from './notification.helper';
import { NotificationGateway } from './notification.gateway';
import { NotificationRecipientsService } from './shared/notification.recipients';

/**
 * 🔔 MÓDULO GLOBAL DE NOTIFICAÇÕES
 * 
 * Módulo global que fornece funcionalidades de notificação para todo o sistema.
 * Inclui:
 * - NotificationService: Lógica principal de notificações
 * - NotificationHelper: Métodos simplificados por entidade
 * - NotificationGateway: WebSocket para tempo real
 */
@Global()
@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'default-secret',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    PushNotificationService,
    NotificationHelper,
    NotificationGateway,
    NotificationRecipientsService,
  ],
  exports: [
    NotificationService,
    PushNotificationService,
    NotificationHelper,
    NotificationGateway,
    NotificationRecipientsService,
  ],
})
export class NotificationModule {}
