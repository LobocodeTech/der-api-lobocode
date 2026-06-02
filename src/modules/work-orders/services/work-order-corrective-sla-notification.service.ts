import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  WorkOrderCorrectiveSlaStatus,
  WorkOrderStatus,
  WorkOrderType,
} from '@prisma/client';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { NotificationService } from '../../notifications/shared/notification.service';
import { ActivityNotificationPreferencesService } from '../../notifications/shared/activity-notification-preferences.service';
import { WorkOrderNotificationScopeService } from 'src/shared/regional-scope/work-order-notification-scope.service';
import { WorkOrderQueueUsersService } from '../work-order-queue-users/work-order-queue-users.service';
import {
  WorkOrderSlaService,
  type CorrectiveSlaSnapshot,
} from './work-order-sla.service';
import { normalizarConfigSlaEmpresa } from '../utils/work-order-corrective-sla.util';

@Injectable()
export class WorkOrderCorrectiveSlaNotificationService {
  private readonly logger = new Logger(
    WorkOrderCorrectiveSlaNotificationService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrderSlaService: WorkOrderSlaService,
    private readonly notificationService: NotificationService,
    private readonly preferencesService: ActivityNotificationPreferencesService,
    private readonly workOrderNotificationScopeService: WorkOrderNotificationScopeService,
    private readonly workOrderQueueUsersService: WorkOrderQueueUsersService,
  ) {}

  async processarAposSnapshot(params: {
    workOrderId: string;
    companyId: string;
    workOrderTitle: string;
    actorUserId: string;
    snapshot: CorrectiveSlaSnapshot;
    slaNearBreachNotifiedAt: Date | null;
    slaOneHourLeftNotifiedAt: Date | null;
    slaBreachedNotifiedAt: Date | null;
  }): Promise<void> {
    const updates: Record<string, Date> = {};

    if (
      this.workOrderSlaService.deveNotificarNearBreach(
        params.snapshot,
        !!params.slaNearBreachNotifiedAt,
      )
    ) {
      await this.enviar(
        params,
        'SLA corretiva: 80% do prazo consumido',
        `A OS "${params.workOrderTitle}" atingiu 80% do tempo de SLA.`,
      );
      updates.slaNearBreachNotifiedAt = new Date();
    }

    if (
      this.workOrderSlaService.deveNotificarUmaHoraRestante(
        params.snapshot,
        !!params.slaOneHourLeftNotifiedAt,
      )
    ) {
      await this.enviar(
        params,
        'SLA corretiva: 1 hora restante',
        `Falta aproximadamente 1 hora útil de SLA para a OS "${params.workOrderTitle}".`,
      );
      updates.slaOneHourLeftNotifiedAt = new Date();
    }

    if (
      this.workOrderSlaService.deveNotificarBreached(
        params.snapshot,
        !!params.slaBreachedNotifiedAt,
      )
    ) {
      await this.enviar(
        params,
        'SLA corretiva vencida',
        `A OS "${params.workOrderTitle}" ultrapassou o prazo de SLA corretiva.`,
      );
      updates.slaBreachedNotifiedAt = new Date();
    }

    if (Object.keys(updates).length > 0) {
      await this.prisma.workOrder.update({
        where: { id: params.workOrderId },
        data: updates,
      });
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async varrerOsCorretivasAbertas(): Promise<void> {
    const ordens = await this.prisma.workOrder.findMany({
      where: {
        deletedAt: null,
        type: WorkOrderType.CORRECTIVE,
        slaStartAt: { not: null },
        status: {
          in: [
            WorkOrderStatus.PENDING,
            WorkOrderStatus.ASSIGNED,
            WorkOrderStatus.IN_PROGRESS,
            WorkOrderStatus.PAUSED,
          ],
        },
      },
      select: {
        id: true,
        title: true,
        companyId: true,
        status: true,
        type: true,
        slaStartAt: true,
        slaPausedAt: true,
        slaResumedAt: true,
        slaConsumedSeconds: true,
        slaDeadlineAt: true,
        slaStatusExtended: true,
        slaExceededAt: true,
        completedAt: true,
        slaNearBreachNotifiedAt: true,
        slaOneHourLeftNotifiedAt: true,
        slaBreachedNotifiedAt: true,
        company: {
          select: {
            correctiveSlaDefaultSeconds: true,
            correctiveSlaWindowStart: true,
            correctiveSlaWindowEnd: true,
          },
        },
      },
      take: 200,
    });

    for (const ordem of ordens) {
      try {
        const config = normalizarConfigSlaEmpresa(ordem.company ?? undefined);
        const snapshot = this.workOrderSlaService.calcularSnapshot(
          ordem,
          config,
        );
        if (!snapshot) continue;

        await this.processarAposSnapshot({
          workOrderId: ordem.id,
          companyId: ordem.companyId,
          workOrderTitle: ordem.title?.trim() || `OS ${ordem.id}`,
          actorUserId: 'system',
          snapshot,
          slaNearBreachNotifiedAt: ordem.slaNearBreachNotifiedAt,
          slaOneHourLeftNotifiedAt: ordem.slaOneHourLeftNotifiedAt,
          slaBreachedNotifiedAt: ordem.slaBreachedNotifiedAt,
        });
      } catch (err) {
        this.logger.warn(
          `Falha ao avaliar SLA corretiva da OS ${ordem.id}: ${String(err)}`,
        );
      }
    }
  }

  private async enviar(
    params: {
      workOrderId: string;
      companyId: string;
      workOrderTitle: string;
      actorUserId: string;
    },
    title: string,
    message: string,
  ): Promise<void> {
    const recipientIds =
      await this.workOrderQueueUsersService.resolveUserIdsFromWorkOrderId(
        params.workOrderId,
        params.companyId,
      );
    if (recipientIds.length === 0) return;

    const filtrados =
      await this.preferencesService.filtrarUsuariosComPreferenciaAtiva(
        recipientIds,
        'deadlines',
      );
    const escopo =
      await this.workOrderNotificationScopeService.filtrarDestinatariosPorEscopoOs(
        params.workOrderId,
        filtrados,
      );
    if (escopo.length === 0) return;

    await this.notificationService.criar({
      title,
      message,
      entityType: 'work-order-corrective-sla',
      entityId: params.workOrderId,
      userId: params.actorUserId,
      companyId: params.companyId,
      recipients: escopo,
    });
  }
}
