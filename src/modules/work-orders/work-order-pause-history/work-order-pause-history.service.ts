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
  WorkOrderSlaStatus,
} from '@prisma/client';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { CreateWorkOrderPauseHistoryDto } from '../dto/create-work-order-pause-history.dto';
import {
  buildWorkOrderPauseHistoryReason,
  isWorkOrderPausePresetReason,
  isWorkOrderResumePresetReason,
} from './work-order-pause-preset.constants';
import { horasRestantesAteFimDoPrazo } from '../utils/work-order-due-date.util';
import { WorkOrderActivityNotificationService } from '../../notifications/shared/work-order-activity-notification.service';
import { WorkOrderQueueUsersService } from '../work-order-queue-users/work-order-queue-users.service';
import { WorkOrdersService } from '../work-orders.service';

@Injectable({ scope: Scope.REQUEST })
export class WorkOrderPauseHistoryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkOrdersService) private readonly workOrdersService: WorkOrdersService,
    private readonly workOrderQueueUsersService: WorkOrderQueueUsersService,
    private readonly workOrderActivityNotificationService: WorkOrderActivityNotificationService,
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

    await this.prisma.$transaction(async (tx) => {
      await tx.workOrderPauseHistory.create({
        data: {
          workOrderId: workOrder.id,
          pausedByUserId,
          reason,
          eventType: WorkOrderPauseHistoryEventType.PAUSE,
        },
      });

      await tx.workOrder.update({
        where: { id: workOrder.id },
        data: {
          status: WorkOrderStatus.PAUSED,
          updatedBy: pausedByUserId,
          slaStatus: this.calculateSlaStatus(workOrder.dueDate),
        },
      });
    });

    await this.notificarMembrosDasFilas(workOrder.id, 'paused');

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

    await this.prisma.$transaction(async (tx) => {
      await tx.workOrderPauseHistory.create({
        data: {
          workOrderId: workOrder.id,
          pausedByUserId: userId,
          reason,
          eventType: WorkOrderPauseHistoryEventType.RESUME,
        },
      });

      await tx.workOrder.update({
        where: { id: workOrder.id },
        data: {
          status: WorkOrderStatus.IN_PROGRESS,
          updatedBy: userId,
          slaStatus: this.calculateSlaStatus(workOrder.dueDate),
        },
      });
    });

    await this.notificarMembrosDasFilas(workOrder.id, 'resumed');

    return this.workOrdersService.buscarDetalhesPorId(workOrder.id);
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
        dueDate: true,
        status: true,
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

  private calculateSlaStatus(dueDate?: Date | null): WorkOrderSlaStatus {
    if (!dueDate) {
      return WorkOrderSlaStatus.OK;
    }

    const hoursRemaining = horasRestantesAteFimDoPrazo(dueDate);
    if (hoursRemaining == null) {
      return WorkOrderSlaStatus.OK;
    }

    if (hoursRemaining <= 0) {
      return WorkOrderSlaStatus.OVERDUE;
    }

    if (hoursRemaining <= 6) {
      return WorkOrderSlaStatus.WARNING;
    }

    return WorkOrderSlaStatus.OK;
  }
}
