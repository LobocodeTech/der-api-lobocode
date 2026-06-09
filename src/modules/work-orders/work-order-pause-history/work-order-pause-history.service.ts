import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import {
  WorkOrderPauseHistoryEventType,
  WorkOrderStatus,
  WorkOrderType,
} from '@prisma/client';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { CreateWorkOrderPauseHistoryDto } from '../dto/create-work-order-pause-history.dto';
import {
  buildWorkOrderPauseHistoryReason,
  isWorkOrderPausePresetReason,
  isWorkOrderResumePresetReason,
} from './work-order-pause-preset.constants';
import { WorkOrderActivityNotificationService } from '../../notifications/shared/work-order-activity-notification.service';
import { WorkOrderQueueUsersService } from '../work-order-queue-users/work-order-queue-users.service';
import { WorkOrdersService } from '../work-orders.service';
import { WorkOrderSlaService } from '../services/work-order-sla.service';
import {
  normalizarConfigSlaEmpresa,
  resolverConfigSlaDaOrdem,
} from '../utils/work-order-corrective-sla.util';
@Injectable({ scope: Scope.REQUEST })
export class WorkOrderPauseHistoryService {
  /** TEMPORÁRIO: sem e-mail nas notificações de OS (WebSocket + push ativos). */
  private readonly omitirEmailNasNotificacoesOs = true;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkOrdersService) private readonly workOrdersService: WorkOrdersService,
    private readonly workOrderQueueUsersService: WorkOrderQueueUsersService,
    private readonly workOrderActivityNotificationService: WorkOrderActivityNotificationService,
    private readonly workOrderSlaService: WorkOrderSlaService,
    @Optional() @Inject(REQUEST) private readonly request?: any,
  ) {}

  async listByWorkOrderId(workOrderId: string) {
    const workOrder = await this.findScopedWorkOrder(workOrderId);

    return this.prisma.workOrderPauseHistory.findMany({
      where: { workOrderId: workOrder.id },
      orderBy: { createdAt: 'desc' },
      include: {
        pausedByUser: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });
  }

  async pause(workOrderId: string, dto: CreateWorkOrderPauseHistoryDto) {
    const workOrder = await this.findScopedWorkOrder(workOrderId);
    const pausedByUserId = this.getCurrentUserId();
    if (!pausedByUserId) {
      throw new BadRequestException('Usuário autenticado não encontrado.');
    }

    if (workOrder.status !== WorkOrderStatus.IN_PROGRESS) {
      throw new BadRequestException(
        'Somente OS em andamento podem ser pausadas.',
      );
    }

    if (!isWorkOrderPausePresetReason(dto.presetReason)) {
      throw new BadRequestException(
        'Motivo inválido para pausa da ordem de serviço.',
      );
    }

    const reason = buildWorkOrderPauseHistoryReason(
      dto.presetReason,
      dto.customReason,
    );

    const agora = new Date();
    const slaPayload = await this.buildPauseSlaUpdate(workOrder, agora);

    await this.prisma.$transaction(async (tx) => {
      await tx.workOrderPauseHistory.create({
        data: {
          workOrderId: workOrder.id,
          pausedByUserId,
          reason,
          eventType: WorkOrderPauseHistoryEventType.PAUSE,
          effectiveSlaConsumedSeconds:
            slaPayload?.slaConsumedSeconds ?? undefined,
          slaStatusExtendedAtEvent:
            slaPayload?.slaStatusExtended ?? undefined,
        },
      });

      await tx.workOrder.update({
        where: { id: workOrder.id },
        data: {
          status: WorkOrderStatus.PAUSED,
          updatedByUser: { connect: { id: pausedByUserId } },
          ...(slaPayload ?? {}),
        },
      });
    });

    await this.notificarMembrosDasFilas(workOrder.id, 'paused');
    await this.processarNotificacoesSla(workOrder.id);

    return this.workOrdersService.buscarDetalhesPorId(workOrder.id);
  }

  async resume(workOrderId: string, dto: CreateWorkOrderPauseHistoryDto) {
    const workOrder = await this.findScopedWorkOrder(workOrderId);
    const userId = this.getCurrentUserId();
    if (!userId) {
      throw new BadRequestException('Usuário autenticado não encontrado.');
    }

    if (workOrder.status !== WorkOrderStatus.PAUSED) {
      throw new BadRequestException(
        'Somente OS pausadas podem ser retomadas.',
      );
    }

    if (!isWorkOrderResumePresetReason(dto.presetReason)) {
      throw new BadRequestException(
        'Motivo inválido para retorno da ordem de serviço.',
      );
    }

    const reason = buildWorkOrderPauseHistoryReason(
      dto.presetReason,
      dto.customReason,
    );

    const agora = new Date();
    const slaPayload = await this.buildResumeSlaUpdate(workOrder, agora);

    await this.prisma.$transaction(async (tx) => {
      await tx.workOrderPauseHistory.create({
        data: {
          workOrderId: workOrder.id,
          pausedByUserId: userId,
          reason,
          eventType: WorkOrderPauseHistoryEventType.RESUME,
          effectiveSlaConsumedSeconds:
            slaPayload?.slaConsumedSeconds ?? undefined,
          slaStatusExtendedAtEvent:
            slaPayload?.slaStatusExtended ?? undefined,
        },
      });

      await tx.workOrder.update({
        where: { id: workOrder.id },
        data: {
          status: WorkOrderStatus.IN_PROGRESS,
          updatedByUser: { connect: { id: userId } },
          ...(slaPayload ?? {}),
        },
      });
    });

    await this.notificarMembrosDasFilas(workOrder.id, 'resumed');
    await this.processarNotificacoesSla(workOrder.id);

    return this.workOrdersService.buscarDetalhesPorId(workOrder.id);
  }

  private async buildPauseSlaUpdate(
    workOrder: Awaited<ReturnType<typeof this.findScopedWorkOrder>>,
    agora: Date,
  ) {
    if (workOrder.type !== WorkOrderType.CORRECTIVE) {
      return null;
    }
    const config = resolverConfigSlaDaOrdem(
      workOrder,
      normalizarConfigSlaEmpresa(workOrder.company ?? undefined),
    );
    const estado = this.mapSlaState(workOrder);
    const payload = this.workOrderSlaService.aoPausar(estado, config, agora);
    if (!payload) return null;
    return payload;
  }

  private async buildResumeSlaUpdate(
    workOrder: Awaited<ReturnType<typeof this.findScopedWorkOrder>>,
    agora: Date,
  ) {
    if (workOrder.type !== WorkOrderType.CORRECTIVE) {
      return null;
    }
    const config = resolverConfigSlaDaOrdem(
      workOrder,
      normalizarConfigSlaEmpresa(workOrder.company ?? undefined),
    );
    const estado = this.mapSlaState(workOrder);
    const payload = this.workOrderSlaService.aoRetomar(estado, config, agora);
    if (!payload) return null;
    return payload;
  }

  private mapSlaState(
    workOrder: Awaited<ReturnType<typeof this.findScopedWorkOrder>>,
  ) {
    return {
      type: workOrder.type,
      status: workOrder.status,
      slaStartAt: workOrder.slaStartAt,
      slaPausedAt: workOrder.slaPausedAt,
      slaResumedAt: workOrder.slaResumedAt,
      slaConsumedSeconds: workOrder.slaConsumedSeconds,
      slaDeadlineAt: workOrder.slaDeadlineAt,
      slaStatusExtended: workOrder.slaStatusExtended,
      slaExceededAt: workOrder.slaExceededAt,
      completedAt: workOrder.completedAt,
    };
  }

  private async processarNotificacoesSla(workOrderId: string): Promise<void> {
    const ordem = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, deletedAt: null },
      select: {
        id: true,
        title: true,
        companyId: true,
        type: true,
        status: true,
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
        slaDeadlineHours: true,
        slaRemainingSeconds: true,
        company: {
          select: {
            correctiveSlaDefaultSeconds: true,
            correctiveSlaWindowStart: true,
            correctiveSlaWindowEnd: true,
          },
        },
      },
    });
    if (!ordem || ordem.type !== WorkOrderType.CORRECTIVE) return;

    const config = resolverConfigSlaDaOrdem(
      ordem,
      normalizarConfigSlaEmpresa(ordem.company ?? undefined),
    );
    const snapshot = this.workOrderSlaService.calcularSnapshot(
      {
        type: ordem.type,
        status: ordem.status,
        slaStartAt: ordem.slaStartAt,
        slaPausedAt: ordem.slaPausedAt,
        slaResumedAt: ordem.slaResumedAt,
        slaConsumedSeconds: ordem.slaConsumedSeconds,
        slaDeadlineAt: ordem.slaDeadlineAt,
        slaStatusExtended: ordem.slaStatusExtended,
        slaExceededAt: ordem.slaExceededAt,
        completedAt: ordem.completedAt,
      },
      config,
      new Date(),
      { preservarDeadlinePersistido: true },
    );
    if (!snapshot) return;

    await this.workOrdersService.notificarLimaresSlaCorretiva(
      ordem.id,
      ordem.companyId,
      ordem.title?.trim() || `OS ${ordem.id}`,
      snapshot,
      {
        slaNearBreachNotifiedAt: ordem.slaNearBreachNotifiedAt,
        slaOneHourLeftNotifiedAt: ordem.slaOneHourLeftNotifiedAt,
        slaBreachedNotifiedAt: ordem.slaBreachedNotifiedAt,
      },
    );
  }

  private async notificarMembrosDasFilas(
    workOrderId: string,
    kind: 'paused' | 'resumed',
  ): Promise<void> {
    const companyId = this.request?.user?.companyId as string | undefined;
    const recipientIds =
      await this.workOrderQueueUsersService.resolveUserIdsFromWorkOrderId(
        workOrderId,
        companyId,
      );
    if (recipientIds.length === 0) return;

    const ordem = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, deletedAt: null },
      select: { title: true, companyId: true },
    });
    if (!ordem) return;

    const actorUserId = this.getCurrentUserId() ?? 'system';
    await this.workOrderActivityNotificationService.notifyAssigneesAboutEvent({
      workOrderId,
      workOrderTitle: ordem.title?.trim() || `OS ${workOrderId}`,
      actorUserId,
      companyId: ordem.companyId ?? companyId,
      recipientUserIds: recipientIds,
      kind,
      skipEmail: this.omitirEmailNasNotificacoesOs,
    });
  }

  private async findScopedWorkOrder(workOrderId: string) {
    const companyId = this.request?.user?.companyId as string | undefined;

    const workOrder = await this.prisma.workOrder.findFirst({
      where: {
        id: workOrderId,
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
      select: {
        id: true,
        type: true,
        dueDate: true,
        status: true,
        companyId: true,
        title: true,
        slaStartAt: true,
        slaPausedAt: true,
        slaResumedAt: true,
        slaConsumedSeconds: true,
        slaDeadlineAt: true,
        slaStatusExtended: true,
        slaExceededAt: true,
        completedAt: true,
        slaDeadlineHours: true,
        slaRemainingSeconds: true,
        company: {
          select: {
            correctiveSlaDefaultSeconds: true,
            correctiveSlaWindowStart: true,
            correctiveSlaWindowEnd: true,
          },
        },
      },
    });

    if (!workOrder) {
      throw new NotFoundException('Ordem de serviço não encontrada.');
    }

    return workOrder;
  }

  private getCurrentUserId() {
    return this.request?.user?.id as string | undefined;
  }

}
