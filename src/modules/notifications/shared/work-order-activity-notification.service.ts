import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NotificationService } from './notification.service';
import { ActivityNotificationPreferencesService } from './activity-notification-preferences.service';
import { resolveActorDisplayName } from './activity-notification-actor';
import { WorkOrderNotificationScopeService } from '../../../shared/regional-scope/work-order-notification-scope.service';

export type WorkOrderLifecycleEventKind =
  | 'started'
  | 'paused'
  | 'resumed'
  | 'completed'
  | 'deleted';

@Injectable()
export class WorkOrderActivityNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly preferencesService: ActivityNotificationPreferencesService,
    private readonly workOrderNotificationScopeService: WorkOrderNotificationScopeService,
  ) {}

  private async filtrarDestinatariosOs(
    workOrderId: string,
    userIds: string[],
  ): Promise<string[]> {
    return this.workOrderNotificationScopeService.filtrarDestinatariosPorEscopoOs(
      workOrderId,
      userIds,
    );
  }

  async notifyAssignment(params: {
    workOrderId: string;
    workOrderTitle: string;
    actorUserId: string;
    companyId?: string;
    assignedUserId: string;
  }) {
    const recipients = await this.filtrarDestinatariosOs(
      params.workOrderId,
      await this.preferencesService.filtrarUsuariosComPreferenciaAtiva(
        [params.assignedUserId],
        'assignments',
      ),
    );
    if (recipients.length === 0) return;

    const actorName = await resolveActorDisplayName(
      this.prisma,
      params.actorUserId,
    );

    await this.notificationService.criar({
      title: 'Nova tarefa atribuída a você',
      message: `${actorName} atribuiu você à OS "${params.workOrderTitle}".`,
      entityType: 'work-order',
      entityId: params.workOrderId,
      userId: params.actorUserId,
      companyId: params.companyId,
      recipients,
    });
  }

  async notifyAssignmentViaQueue(params: {
    workOrderId: string;
    workOrderTitle: string;
    queueTitle: string;
    actorUserId: string;
    companyId?: string;
    assignedUserId: string;
  }) {
    const recipients = await this.filtrarDestinatariosOs(
      params.workOrderId,
      await this.preferencesService.filtrarUsuariosComPreferenciaAtiva(
        [params.assignedUserId],
        'assignments',
      ),
    );
    if (recipients.length === 0) return;

    const actorName = await resolveActorDisplayName(
      this.prisma,
      params.actorUserId,
    );
    const fila = params.queueTitle.trim() || 'Fila';
    const os = params.workOrderTitle.trim() || `OS ${params.workOrderId}`;

    await this.notificationService.criar({
      title: 'Nova tarefa atribuída a você',
      message: `${actorName} associou você à OS "${os}" pela fila "${fila}".`,
      entityType: 'work-order',
      entityId: params.workOrderId,
      userId: params.actorUserId,
      companyId: params.companyId,
      recipients,
    });
  }

  async notifyUnassignmentViaQueue(params: {
    workOrderId: string;
    workOrderTitle: string;
    queueTitle: string;
    actorUserId: string;
    companyId?: string;
    removedUserId: string;
  }) {
    const recipients = await this.filtrarDestinatariosOs(
      params.workOrderId,
      await this.preferencesService.filtrarUsuariosComPreferenciaAtiva(
        [params.removedUserId],
        'assignments',
      ),
    );
    if (recipients.length === 0) return;

    const actorName = await resolveActorDisplayName(
      this.prisma,
      params.actorUserId,
    );
    const fila = params.queueTitle.trim() || 'Fila';
    const os = params.workOrderTitle.trim() || `OS ${params.workOrderId}`;

    await this.notificationService.criar({
      title: 'Você foi removido da tarefa',
      message: `${actorName} removeu você da OS "${os}" (fila "${fila}" desvinculada).`,
      entityType: 'work-order-unassignment',
      entityId: params.workOrderId,
      userId: params.actorUserId,
      companyId: params.companyId,
      recipients,
    });
  }

  async notifyUnassignment(params: {
    workOrderId: string;
    workOrderTitle: string;
    actorUserId: string;
    companyId?: string;
    removedUserId: string;
  }) {
    const recipients = await this.filtrarDestinatariosOs(
      params.workOrderId,
      await this.preferencesService.filtrarUsuariosComPreferenciaAtiva(
        [params.removedUserId],
        'assignments',
      ),
    );
    if (recipients.length === 0) return;

    const actorName = await resolveActorDisplayName(
      this.prisma,
      params.actorUserId,
    );

    await this.notificationService.criar({
      title: 'Você foi removido da tarefa',
      message: `${actorName} removeu você da OS "${params.workOrderTitle}".`,
      entityType: 'work-order-unassignment',
      entityId: params.workOrderId,
      userId: params.actorUserId,
      companyId: params.companyId,
      recipients,
    });
  }

  async notifyOnCreate(params: {
    workOrderId: string;
    workOrderTitle: string;
    actorUserId: string;
    companyId: string;
  }) {
    const companyUserIds =
      await this.workOrderNotificationScopeService.resolverDestinatariosBroadcastCriacaoOs(
        params.workOrderId,
        params.companyId,
      );
    const recipients = await this.filtrarDestinatariosOs(
      params.workOrderId,
      await this.preferencesService.filtrarUsuariosComPreferenciaAtiva(
        companyUserIds.filter((id) => id !== params.actorUserId),
        'assignments',
      ),
    );
    if (recipients.length === 0) return;

    const actorName = await resolveActorDisplayName(
      this.prisma,
      params.actorUserId,
    );

    await this.notificationService.criar({
      title: 'Nova OS criada',
      message: `${actorName} criou a OS "${params.workOrderTitle}".`,
      entityType: 'work-order',
      entityId: params.workOrderId,
      userId: params.actorUserId,
      companyId: params.companyId,
      recipients,
      // TEMPORÁRIO: sem e-mail na criação de OS (WebSocket + push ativos).
      skipEmail: true,
    });
  }

  private lifecycleMessages: Record<
    WorkOrderLifecycleEventKind,
    { title: string; message: (actorName: string, workOrderTitle: string) => string }
  > = {
    started: {
      title: 'OS iniciada',
      message: (actor, title) =>
        `${actor} iniciou a OS "${title}".`,
    },
    paused: {
      title: 'OS pausada',
      message: (actor, title) =>
        `${actor} pausou a OS "${title}".`,
    },
    resumed: {
      title: 'OS retomada',
      message: (actor, title) =>
        `${actor} retomou a OS "${title}".`,
    },
    completed: {
      title: 'OS concluída',
      message: (actor, title) =>
        `${actor} concluiu a OS "${title}".`,
    },
    deleted: {
      title: 'OS excluída',
      message: (actor, title) =>
        `${actor} excluiu a OS "${title}".`,
    },
  };

  async notifyAssigneesAboutEvent(params: {
    workOrderId: string;
    workOrderTitle: string;
    actorUserId: string;
    companyId?: string;
    recipientUserIds: string[];
    kind: WorkOrderLifecycleEventKind;
  }) {
    const uniqueRecipients = Array.from(
      new Set(
        params.recipientUserIds.filter(
          (id) => id && id !== params.actorUserId,
        ),
      ),
    );
    if (uniqueRecipients.length === 0) return;

    const recipients = await this.filtrarDestinatariosOs(
      params.workOrderId,
      await this.preferencesService.filtrarUsuariosComPreferenciaAtiva(
        uniqueRecipients,
        'assignments',
      ),
    );
    if (recipients.length === 0) return;

    const actorName = await resolveActorDisplayName(
      this.prisma,
      params.actorUserId,
    );
    const config = this.lifecycleMessages[params.kind];
    const workOrderTitle =
      params.workOrderTitle.trim() || `OS ${params.workOrderId}`;

    await this.notificationService.criar({
      title: config.title,
      message: config.message(actorName, workOrderTitle),
      entityType: 'work-order',
      entityId: params.workOrderId,
      userId: params.actorUserId,
      companyId: params.companyId,
      recipients,
    });
  }

  async notifyNewComment(params: {
    workOrderId: string;
    workOrderTitle: string;
    actorUserId: string;
    companyId?: string;
    assigneeUserIds: string[];
  }) {
    const baseRecipients = params.assigneeUserIds.filter(
      (id) => id !== params.actorUserId,
    );
    const recipients = await this.filtrarDestinatariosOs(
      params.workOrderId,
      await this.preferencesService.filtrarUsuariosComPreferenciaAtiva(
        baseRecipients,
        'comments',
      ),
    );
    if (recipients.length === 0) return;

    const actorName = await resolveActorDisplayName(
      this.prisma,
      params.actorUserId,
    );

    await this.notificationService.criar({
      title: 'Novo comentário em sua tarefa',
      message: `${actorName} comentou na OS "${params.workOrderTitle}".`,
      entityType: 'work-order',
      entityId: params.workOrderId,
      userId: params.actorUserId,
      companyId: params.companyId,
      recipients,
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async notifyUpcomingDeadlines() {
    // Notificações por dueDate (SLA legado) desativadas: Preventiva/Geral sem SLA; Corretiva usa tempo útil.
  }

  @Cron(CronExpression.EVERY_WEEK)
  async notifyWeeklyReports() {
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        companyId: true,
      },
    });

    const byCompany = new Map<string, string[]>();
    users.forEach((user) => {
      const ids = byCompany.get(user.companyId) ?? [];
      ids.push(user.id);
      byCompany.set(user.companyId, ids);
    });

    for (const [companyId, userIds] of Array.from(byCompany.entries())) {
      const recipients =
        await this.preferencesService.filtrarUsuariosComPreferenciaAtiva(
          userIds,
          'reports',
        );
      if (recipients.length === 0) continue;

      await this.notificationService.criar({
        title: 'Relatório semanal disponível',
        message: 'Seu resumo semanal de atividades já está disponível.',
        entityType: 'weekly-report',
        entityId: `week-${new Date().toISOString().slice(0, 10)}`,
        userId: 'system',
        companyId,
        recipients,
      });
    }
  }
}
