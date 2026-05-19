import { Injectable } from '@nestjs/common';
import { AssetType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { formatAssetTypeLabel } from '../../../shared/common/utils/asset-type-label';
import { NotificationService } from './notification.service';
import { ActivityNotificationPreferencesService } from './activity-notification-preferences.service';
import { NotificationRecipientsService } from './notification.recipients';
import { resolveActorDisplayName } from './activity-notification-actor';

@Injectable()
export class PlanningActivityNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly preferencesService: ActivityNotificationPreferencesService,
    private readonly recipientsService: NotificationRecipientsService,
  ) {}

  async notifyAssignment(params: {
    planningId: string;
    planningTitle: string;
    planningEquipmentType: AssetType;
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
    const equipmentLabel = formatAssetTypeLabel(params.planningEquipmentType);

    await this.notificationService.criar({
      title: 'Nova tarefa atribuída a você',
      message: `${actorName} atribuiu você ao planejamento "${params.planningTitle}" (${equipmentLabel}).`,
      entityType: 'planning',
      entityId: params.planningId,
      userId: params.actorUserId,
      companyId: params.companyId,
      recipients,
    });
  }

  async notifyUnassignment(params: {
    planningId: string;
    planningTitle: string;
    planningEquipmentType: AssetType;
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
    const equipmentLabel = formatAssetTypeLabel(params.planningEquipmentType);

    await this.notificationService.criar({
      title: 'Você foi removido da tarefa',
      message: `${actorName} removeu você do planejamento "${params.planningTitle}" (${equipmentLabel}).`,
      entityType: 'planning-unassignment',
      entityId: params.planningId,
      userId: params.actorUserId,
      companyId: params.companyId,
      recipients,
    });
  }

  async notifyOnCreate(params: {
    planningId: string;
    planningTitle: string;
    planningEquipmentType: AssetType;
    actorUserId: string;
    companyId: string;
  }) {
    const companyUserIds = await this.recipientsService.getRecipients(
      params.companyId,
      'ALL',
    );
    const recipients =
      await this.preferencesService.filtrarUsuariosComPreferenciaAtiva(
        companyUserIds.filter((id) => id !== params.actorUserId),
        'assignments',
      );
    if (recipients.length === 0) return;

    const actorName = await resolveActorDisplayName(
      this.prisma,
      params.actorUserId,
    );
    const equipmentLabel = formatAssetTypeLabel(params.planningEquipmentType);

    await this.notificationService.criar({
      title: 'Novo planejamento criado',
      message: `${actorName} criou o planejamento "${params.planningTitle}" (${equipmentLabel}).`,
      entityType: 'planning',
      entityId: params.planningId,
      userId: params.actorUserId,
      companyId: params.companyId,
      recipients,
    });
  }
}
