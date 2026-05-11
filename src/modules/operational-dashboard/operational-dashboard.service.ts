import { Injectable } from '@nestjs/common';
import {
    AssetType,
  AssetStatus,
  Prisma,
  WorkOrderSlaStatus,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderType,
} from '@prisma/client';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { TenantService } from 'src/shared/tenant/tenant.service';

@Injectable()
export class OperationalDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  async obterResumoOperacional() {
    const companyId = this.tenantService.getCompanyId();
    const periodStart = this.obterInicioDosUltimosDias(7);

    const assetWhere: Prisma.AssetWhereInput = {
      deletedAt: null,
      ...(companyId && { companyId }),
    };

    const workOrderWhere: Prisma.WorkOrderWhereInput = {
      deletedAt: null,
      ...(companyId && { companyId }),
    };

    const [
      totalAssets,
      onlineAssets,
      offlineAssets,
      criticalAssets,
      warningAssets,
      totalWorkOrders,
      pendingWorkOrdersCount,
      inProgressWorkOrders,
      completedWorkOrders,
      warningSla,
      overdueSla,
      recentCriticalWorkOrders,
      pendingSlaWorkOrders,
      workOrderTrendRecords,
      mttrRecords,
      monitoredEquipmentPairs,
      lastPreventiveByPair,
    ] = await this.prisma.$transaction([
      this.prisma.asset.count({ where: assetWhere }),
      this.prisma.asset.count({
        where: { ...assetWhere, status: AssetStatus.ONLINE },
      }),
      this.prisma.asset.count({
        where: { ...assetWhere, status: AssetStatus.OFFLINE },
      }),
      this.prisma.asset.count({
        where: { ...assetWhere, status: AssetStatus.CRITICAL },
      }),
      this.prisma.asset.count({
        where: { ...assetWhere, status: AssetStatus.WARNING },
      }),
      this.prisma.workOrder.count({ where: workOrderWhere }),
      this.prisma.workOrder.count({
        where: { ...workOrderWhere, status: WorkOrderStatus.PENDING },
      }),
      this.prisma.workOrder.count({
        where: { ...workOrderWhere, status: WorkOrderStatus.IN_PROGRESS },
      }),
      this.prisma.workOrder.count({
        where: { ...workOrderWhere, status: WorkOrderStatus.COMPLETED },
      }),
      this.prisma.workOrder.count({
        where: { ...workOrderWhere, slaStatus: WorkOrderSlaStatus.WARNING },
      }),
      this.prisma.workOrder.count({
        where: { ...workOrderWhere, slaStatus: WorkOrderSlaStatus.OVERDUE },
      }),
      this.prisma.workOrder.findMany({
        where: {
          ...workOrderWhere,
          status: { not: WorkOrderStatus.COMPLETED },
          priority: {
            in: [WorkOrderPriority.CRITICAL, WorkOrderPriority.HIGH],
          },
        },
        select: {
          id: true,
          title: true,
          priority: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.workOrder.findMany({
        where: {
          ...workOrderWhere,
          status: {
            notIn: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED],
          },
          slaStatus: {
            in: [WorkOrderSlaStatus.WARNING, WorkOrderSlaStatus.OVERDUE],
          },
        },
        select: {
          id: true,
          title: true,
          priority: true,
          status: true,
          dueDate: true,
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 5,
      }),
      this.prisma.workOrder.findMany({
        where: {
          ...workOrderWhere,
          OR: [
            { createdAt: { gte: periodStart } },
            {
              status: WorkOrderStatus.COMPLETED,
              updatedAt: { gte: periodStart },
            },
          ],
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.workOrder.findMany({
        where: {
          ...workOrderWhere,
          status: WorkOrderStatus.COMPLETED,
          completedAt: { gte: periodStart },
        },
        select: {
          id: true,
          startedAt: true,
          completedAt: true,
        },
      }),
      this.prisma.workOrder.findMany({
        where: {
          ...workOrderWhere,
          equipmentType: {
            in: [AssetType.CAMERA, AssetType.ATDB, AssetType.PMV],
          },
        },
        distinct: ['locationId', 'equipmentType'],
        select: {
          locationId: true,
          equipmentType: true,
          location: {
            select: {
              id: true,
              name: true,
              code: true,
              regional: {
                select: {
                  id: true,
                  city: true,
                  cgr: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.workOrder.groupBy({
        where: {
          ...workOrderWhere,
          type: WorkOrderType.PREVENTIVE,
          status: WorkOrderStatus.COMPLETED,
          equipmentType: {
            in: [AssetType.CAMERA, AssetType.ATDB, AssetType.PMV],
          },
        },
        by: ['locationId', 'equipmentType'],
        orderBy: [{ locationId: 'asc' }, { equipmentType: 'asc' }],
        _max: {
          updatedAt: true,
        },
      }),
    ]);

    const availabilityRate =
      totalAssets > 0 ? Number(((onlineAssets / totalAssets) * 100).toFixed(1)) : 0;

    const criticalIncidents = recentCriticalWorkOrders.map((wo) => ({
      id: wo.id,
      asset: 'Ordem de serviço',
      rodovia: 'Não informado',
      km: 0,
      issue: wo.title,
      severity:
        wo.priority === WorkOrderPriority.CRITICAL ? 'critical' : 'high',
      time: wo.createdAt.toISOString(),
    }));

    const workOrdersTrend = this.construirSerieDeOrdens(workOrderTrendRecords, 7);
    const mttrTrend = this.construirSerieDeMttr(mttrRecords, 7);
    const pendingWorkOrders = pendingSlaWorkOrders.map((order) => ({
      id: order.id,
      title: order.title,
      priority: order.priority,
      status: order.status,
      dueDate: order.dueDate?.toISOString() ?? null,
    }));
    const preventiveMap = new Map(
      lastPreventiveByPair.map((item) => [
        `${item.locationId}:${item.equipmentType}`,
        item._max?.updatedAt ?? null,
      ]),
    );
    const preventiveAgingByLocationEquipment = monitoredEquipmentPairs
      .map((pair) => {
        const preventiveAt = preventiveMap.get(
          `${pair.locationId}:${pair.equipmentType}`,
        );
        const daysSinceLastPreventive = preventiveAt
          ? this.calcularDiasDesde(preventiveAt)
          : null;

        return {
          locationId: pair.locationId,
          locationName: pair.location?.name ?? 'Localidade',
          locationCode: pair.location?.code ?? null,
          regionalName: pair.location?.regional?.city ?? null,
          equipmentType: pair.equipmentType,
          lastPreventiveAt: preventiveAt?.toISOString() ?? null,
          daysSinceLastPreventive,
        };
      })
      .sort((a, b) => {
        const left = a.daysSinceLastPreventive ?? Number.MAX_SAFE_INTEGER;
        const right = b.daysSinceLastPreventive ?? Number.MAX_SAFE_INTEGER;
        return right - left;
      })
      .slice(0, 8);

    return {
      assets: {
        total: totalAssets,
        online: onlineAssets,
        offline: offlineAssets,
        critical: criticalAssets,
        warning: warningAssets,
        availabilityRate,
      },
      workOrders: {
        total: totalWorkOrders,
        pending: pendingWorkOrdersCount,
        inProgress: inProgressWorkOrders,
        completed: completedWorkOrders,
        slaWarning: warningSla,
        slaOverdue: overdueSla,
      },
      criticalIncidents,
      pendingWorkOrders,
      workOrdersTrend,
      mttrTrend,
      preventiveAgingByLocationEquipment,
    };
  }

  private calcularDiasDesde(date: Date): number {
    const diffMs = Date.now() - date.getTime();
    if (diffMs <= 0) return 0;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  private obterInicioDosUltimosDias(totalDias: number): Date {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (totalDias - 1));
    return date;
  }

  private construirSerieDeOrdens(
    records: Array<{
      id: string;
      status: WorkOrderStatus;
      createdAt: Date;
      updatedAt: Date;
    }>,
    totalDias: number,
  ) {
    return this.obterJanelaDeDias(totalDias).map((day) => ({
      date: day.key,
      label: day.label,
      opened: records.filter(
        (record) => record.createdAt.toISOString().slice(0, 10) === day.key,
      ).length,
      completed: records.filter(
        (record) =>
          record.status === WorkOrderStatus.COMPLETED &&
          record.updatedAt.toISOString().slice(0, 10) === day.key,
      ).length,
    }));
  }

  private construirSerieDeMttr(
    records: Array<{
      id: string;
      startedAt: Date | null;
      completedAt: Date | null;
    }>,
    totalDias: number,
  ) {
    return this.obterJanelaDeDias(totalDias).map((day) => {
      const recordsOfDay = records.filter(
        (record) =>
          record.completedAt &&
          record.completedAt.toISOString().slice(0, 10) === day.key,
      );
      const validRecords = recordsOfDay.filter(
        (record) =>
          record.startedAt &&
          record.completedAt &&
          record.completedAt.getTime() > record.startedAt.getTime(),
      );

      if (validRecords.length === 0) {
        return {
          date: day.key,
          label: day.label,
          hours: 0,
        };
      }

      const averageHours =
        validRecords.reduce((total, record) => {
          const elapsedMs = record.completedAt!.getTime() - record.startedAt!.getTime();
          return total + elapsedMs / (1000 * 60 * 60);
        }, 0) / validRecords.length;

      return {
        date: day.key,
        label: day.label,
        hours: Number(averageHours.toFixed(1)),
      };
    });
  }

  private obterJanelaDeDias(totalDias: number) {
    const formatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

    return Array.from({ length: totalDias }).map((_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (totalDias - 1 - index));

      return {
        key: date.toISOString().slice(0, 10),
        label: formatter
          .format(date)
          .replace('.', '')
          .replace(/^\w/, (char) => char.toUpperCase()),
      };
    });
  }
}

