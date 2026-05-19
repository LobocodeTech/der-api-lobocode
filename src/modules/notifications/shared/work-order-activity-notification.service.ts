import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NotificationService } from './notification.service';
import { ActivityNotificationPreferencesService } from './activity-notification-preferences.service';
import { NotificationRecipientsService } from './notification.recipients';
import { resolveActorDisplayName } from './activity-notification-actor';

@Injectable()
export class WorkOrderActivityNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly preferencesService: ActivityNotificationPreferencesService,
    private readonly recipientsService: NotificationRecipientsService,
  ) {}

  async notifyAssignment(params: {
    workOrderId: string;
    workOrderTitle: string;
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

  async notifyUnassignment(params: {
    workOrderId: string;
    workOrderTitle: string;
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

    await this.notificationService.criar({
      title: 'Nova OS criada',
      message: `${actorName} criou a OS "${params.workOrderTitle}".`,
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
    const recipients =
      await this.preferencesService.filtrarUsuariosComPreferenciaAtiva(
        baseRecipients,
        'comments',
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
    const workOrders = await this.prisma.workOrder.findMany({
      where: {
        deletedAt: null,
        dueDate: { not: null },
        status: {
          notIn: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED],
        },
      },
      select: {
        id: true,
        title: true,
        companyId: true,
        dueDate: true,
        assignees: {
          select: {
            userId: true,
          },
        },
      },
    });

    const todayBr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());

    const tomorrowBr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));

    const ymdFromDbDate = (d: Date | null): string | null => {
      if (!d) return null;
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    for (const order of workOrders) {
      const ymd = ymdFromDbDate(order.dueDate);
      if (!ymd || (ymd !== todayBr && ymd !== tomorrowBr)) {
        continue;
      }

      const recipients =
        await this.preferencesService.filtrarUsuariosComPreferenciaAtiva(
          order.assignees.map((a) => a.userId),
          'deadlines',
        );
      if (recipients.length === 0) continue;

      const quando = ymd === todayBr ? 'hoje' : 'amanhã';

      await this.notificationService.criar({
        title: 'Prazo próximo',
        message: `A OS "${order.title}" tem prazo ${quando} (${ymd}).`,
        entityType: 'work-order-deadline',
        entityId: order.id,
        userId: 'system',
        companyId: order.companyId,
        recipients,
      });
    }
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
