import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NotificationService } from './notification.service';
import { ActivityNotificationPreferencesService } from './activity-notification-preferences.service';
import { resolveActorDisplayName } from './activity-notification-actor';

@Injectable()
export class QueueActivityNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly preferencesService: ActivityNotificationPreferencesService,
  ) {}

  async notifyAssociationOnCreate(params: {
    queueId: string;
    queueTitle: string;
    actorUserId: string;
    companyId?: string;
    assignedUserId: string;
  }) {
    const recipients =
      await this.preferencesService.filtrarUsuariosComPreferenciaAtiva(
        [params.assignedUserId],
        'assignments',
      );
    if (recipients.length === 0) return;

    const actorName = await resolveActorDisplayName(
      this.prisma,
      params.actorUserId,
    );
    const fila = params.queueTitle.trim() || 'Fila';

    await this.notificationService.criar({
      title: 'Você foi associado a uma fila',
      message: `Você foi associado à fila "${fila}", criada por ${actorName}.`,
      entityType: 'queue',
      entityId: params.queueId,
      userId: params.actorUserId,
      companyId: params.companyId,
      recipients,
      skipEmail: true,
    });
  }

  async notifyAssociationOnUpdate(params: {
    queueId: string;
    queueTitle: string;
    actorUserId: string;
    companyId?: string;
    assignedUserId: string;
  }) {
    const recipients =
      await this.preferencesService.filtrarUsuariosComPreferenciaAtiva(
        [params.assignedUserId],
        'assignments',
      );
    if (recipients.length === 0) return;

    const actorName = await resolveActorDisplayName(
      this.prisma,
      params.actorUserId,
    );
    const fila = params.queueTitle.trim() || 'Fila';

    await this.notificationService.criar({
      title: 'Você foi associado a uma fila',
      message: `Você foi associado à fila "${fila}" por ${actorName}.`,
      entityType: 'queue',
      entityId: params.queueId,
      userId: params.actorUserId,
      companyId: params.companyId,
      recipients,
      skipEmail: true,
    });
  }

  async notifyUnassociation(params: {
    queueId: string;
    queueTitle: string;
    actorUserId: string;
    companyId?: string;
    removedUserId: string;
  }) {
    const recipients =
      await this.preferencesService.filtrarUsuariosComPreferenciaAtiva(
        [params.removedUserId],
        'assignments',
      );
    if (recipients.length === 0) return;

    const actorName = await resolveActorDisplayName(
      this.prisma,
      params.actorUserId,
    );
    const fila = params.queueTitle.trim() || 'Fila';

    await this.notificationService.criar({
      title: 'Você foi desassociado de uma fila',
      message: `Você foi desassociado da fila "${fila}" por ${actorName}.`,
      entityType: 'queue-unassignment',
      entityId: params.queueId,
      userId: params.actorUserId,
      companyId: params.companyId,
      recipients,
      skipEmail: true,
    });
  }
}
