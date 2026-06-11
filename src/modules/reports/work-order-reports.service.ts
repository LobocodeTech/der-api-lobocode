import { Injectable } from '@nestjs/common';
import {
  Prisma,
  WorkOrderCorrectiveSlaStatus,
  WorkOrderSlaStatus,
  WorkOrderStatus,
  WorkOrderType,
} from '@prisma/client';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { UniversalQueryService } from 'src/shared/universal';
import { construirWorkOrderQueueInclude } from '../work-orders/work-order-queue-users/work-order-queue-users.service';
import { construirWhereWorkOrderQueueLegivel } from 'src/shared/casl/casl-ability/casl-ability.service';
import { WORK_ORDER_AUDIT_USER_SELECT } from '../work-orders/dto/work-order-audit.fields';
import {
  ReportSlaBucket,
  WorkOrderReportFilterDto,
} from './dto/work-order-report-filter.dto';
import {
  CORRECTIVE_SLA_NEGATIVE_STATUSES,
  CORRECTIVE_SLA_NEAR_STATUSES,
  CORRECTIVE_SLA_POSITIVE_STATUSES,
  WorkOrderReportExportResponse,
  WorkOrderReportItem,
  WorkOrderReportListResponse,
  WorkOrderReportSummary,
  WorkOrderReportUserRef,
} from './types/work-order-report.types';
import { resolverIntervaloPeriodoRelatorio } from './utils/work-order-report-period.util';
import {
  calcularMetricasCorretiva,
  calcularMetricasDueDate,
  normalizarConfigEmpresaRelatorio,
  resolverSlaBucketCorretiva,
} from './utils/work-order-report-metrics.util';

const EXPORT_MAX_ROWS = 10_000;
const IN_PROGRESS_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.PAUSED,
];

const RELATORIO_WORK_ORDER_INCLUDE = {
  location: {
    include: {
      regional: {
        select: { id: true, cgr: true, city: true, color: true },
      },
    },
  },
  createdByUser: { select: WORK_ORDER_AUDIT_USER_SELECT },
  company: {
    select: {
      correctiveSlaDefaultSeconds: true,
      correctiveSlaWindowStart: true,
      correctiveSlaWindowEnd: true,
    },
  },
  workOrderQueues: {
    where: construirWhereWorkOrderQueueLegivel(),
    include: construirWorkOrderQueueInclude(),
  },
  workOrderPauseHistories: {
    select: { eventType: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
};

type WorkOrderComRelacoes = Awaited<
  ReturnType<WorkOrderReportsService['buscarRegistrosRelatorio']>
>[number];

@Injectable()
export class WorkOrderReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryService: UniversalQueryService,
  ) {}

  async listarRelatorio(
    filtros: WorkOrderReportFilterDto,
  ): Promise<WorkOrderReportListResponse> {
    const page = filtros.page ?? 1;
    const limit = filtros.limit ?? 20;
    const where = this.montarWhere(filtros);
    const orderBy = this.montarOrderBy(filtros);
    const [total, registros] = await this.prisma.$transaction([
      this.prisma.workOrder.count({ where }),
      this.buscarRegistrosRelatorio(where, orderBy, (page - 1) * limit, limit),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      data: registros.map((registro) => this.mapearItem(registro)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async obterResumo(
    filtros: WorkOrderReportFilterDto,
  ): Promise<WorkOrderReportSummary> {
    const where = this.montarWhere(filtros);
    const whereCorretiva: Prisma.WorkOrderWhereInput = {
      ...where,
      type: WorkOrderType.CORRECTIVE,
    };
    const [
      totalCorretivas,
      emAndamento,
      finalizadas,
      atrasadas,
      slaPositivo,
      slaNegativo,
      concluidasNoPrazo,
      totalPausasCount,
      resumeCount,
    ] = await this.prisma.$transaction([
      this.prisma.workOrder.count({ where: whereCorretiva }),
      this.prisma.workOrder.count({
        where: {
          ...whereCorretiva,
          status: { in: IN_PROGRESS_STATUSES },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          ...whereCorretiva,
          status: WorkOrderStatus.COMPLETED,
        },
      }),
      this.prisma.workOrder.count({
        where: {
          ...whereCorretiva,
          OR: [
            { slaStatusExtended: { in: CORRECTIVE_SLA_NEGATIVE_STATUSES } },
            {
              status: { in: IN_PROGRESS_STATUSES },
              slaStatusExtended: WorkOrderCorrectiveSlaStatus.BREACHED,
            },
          ],
        },
      }),
      this.prisma.workOrder.count({
        where: {
          ...whereCorretiva,
          slaStatusExtended: { in: CORRECTIVE_SLA_POSITIVE_STATUSES },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          ...whereCorretiva,
          slaStatusExtended: { in: CORRECTIVE_SLA_NEGATIVE_STATUSES },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          ...whereCorretiva,
          slaStatusExtended: WorkOrderCorrectiveSlaStatus.COMPLETED_ON_TIME,
        },
      }),
      this.prisma.workOrderPauseHistory.count({
        where: {
          eventType: 'PAUSE',
          workOrder: where,
        },
      }),
      this.prisma.workOrderPauseHistory.count({
        where: {
          eventType: 'RESUME',
          workOrder: where,
        },
      }),
    ]);
    const totalPausas = totalPausasCount;
    const registrosPausa = await this.prisma.workOrder.findMany({
      where: {
        ...where,
        type: WorkOrderType.CORRECTIVE,
        workOrderPauseHistories: { some: {} },
      },
      take: 500,
      select: {
        type: true,
        status: true,
        startedAt: true,
        completedAt: true,
        slaStartAt: true,
        slaPausedAt: true,
        slaResumedAt: true,
        slaConsumedSeconds: true,
        slaRemainingSeconds: true,
        slaDeadlineAt: true,
        slaDeadlineHours: true,
        slaStatusExtended: true,
        dueDate: true,
        slaStatus: true,
        workOrderPauseHistories: {
          select: { eventType: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        company: {
          select: {
            correctiveSlaDefaultSeconds: true,
            correctiveSlaWindowStart: true,
            correctiveSlaWindowEnd: true,
          },
        },
      },
    });
    const totalPausedSeconds = registrosPausa.reduce((acc, registro) => {
      const metricas = calcularMetricasCorretiva({
        type: registro.type,
        status: registro.status,
        startedAt: registro.startedAt,
        completedAt: registro.completedAt,
        slaStartAt: registro.slaStartAt,
        slaPausedAt: registro.slaPausedAt,
        slaResumedAt: registro.slaResumedAt,
        slaConsumedSeconds: registro.slaConsumedSeconds,
        slaRemainingSeconds: registro.slaRemainingSeconds,
        slaDeadlineAt: registro.slaDeadlineAt,
        slaDeadlineHours: registro.slaDeadlineHours,
        slaStatusExtended: registro.slaStatusExtended,
        dueDate: registro.dueDate,
        slaStatus: registro.slaStatus,
        pauseHistories: registro.workOrderPauseHistories,
        companyConfig: normalizarConfigEmpresaRelatorio(registro.company),
      });
      return acc + metricas.totalPausedSeconds;
    }, 0);
    const complianceRate =
      finalizadas > 0
        ? Number(((concluidasNoPrazo / finalizadas) * 100).toFixed(1))
        : totalCorretivas > 0
          ? Number(((slaPositivo / totalCorretivas) * 100).toFixed(1))
          : 0;
    return {
      corrective: {
        total: totalCorretivas,
        inProgress: emAndamento,
        completed: finalizadas,
        overdue: atrasadas,
      },
      sla: {
        positive: slaPositivo,
        negative: slaNegativo,
        complianceRate,
      },
      pauses: {
        totalCount: totalPausas,
        totalPausedSeconds,
      },
      returns: {
        totalCount: resumeCount,
      },
    };
  }

  async exportarRelatorio(
    filtros: WorkOrderReportFilterDto,
  ): Promise<WorkOrderReportExportResponse> {
    const where = this.montarWhere(filtros);
    const orderBy = this.montarOrderBy(filtros);
    const registros = await this.buscarRegistrosRelatorio(
      where,
      orderBy,
      0,
      EXPORT_MAX_ROWS,
    );
    const itens = registros.map((registro) => this.mapearItem(registro));
    const summary = await this.obterResumo(filtros);
    return {
      summary,
      corrective: itens.filter((item) => item.type === WorkOrderType.CORRECTIVE),
      preventive: itens.filter((item) => item.type === WorkOrderType.PREVENTIVE),
      general: itens.filter((item) => item.type === WorkOrderType.GENERAL),
      generatedAt: new Date().toISOString(),
    };
  }

  private buscarRegistrosRelatorio(
    where: Prisma.WorkOrderWhereInput,
    orderBy: Prisma.WorkOrderOrderByWithRelationInput,
    skip: number,
    take: number,
  ) {
    return this.prisma.workOrder.findMany({
      where,
      orderBy,
      skip,
      take,
      include: RELATORIO_WORK_ORDER_INCLUDE,
    });
  }

  private montarWhere(filtros: WorkOrderReportFilterDto): Prisma.WorkOrderWhereInput {
    const { start, end } = resolverIntervaloPeriodoRelatorio(
      filtros.period,
      filtros.dateFrom,
      filtros.dateTo,
    );
    const baseWhere = this.queryService.construirWhereClauseParaRead('WorkOrder', {
      createdAt: { gte: start, lte: end },
    });
    const and: Prisma.WorkOrderWhereInput[] = [];
    if (filtros.type) and.push({ type: filtros.type });
    if (filtros.locationId) and.push({ locationId: filtros.locationId });
    if (filtros.regionalId) {
      and.push({ location: { regionalId: filtros.regionalId } });
    }
    if (filtros.equipmentType) and.push({ equipmentType: filtros.equipmentType });
    if (filtros.status) and.push({ status: filtros.status });
    if (filtros.createdById) and.push({ createdBy: filtros.createdById });
    if (filtros.assigneeId) {
      and.push({
        workOrderQueues: {
          some: {
            queue: {
              queueUsers: { some: { userId: filtros.assigneeId } },
            },
          },
        },
      });
    }
    if (filtros.search?.trim()) {
      const termo = filtros.search.trim();
      and.push({
        OR: [
          { sequentialNumber: { contains: termo, mode: 'insensitive' } },
          { title: { contains: termo, mode: 'insensitive' } },
          { location: { name: { contains: termo, mode: 'insensitive' } } },
        ],
      });
    }
    if (filtros.slaBucket) {
      and.push(this.montarFiltroSlaBucket(filtros.slaBucket, filtros.type));
    }
    if (and.length === 0) return baseWhere;
    return { AND: [baseWhere, ...and] };
  }

  private montarFiltroSlaBucket(
    bucket: ReportSlaBucket,
    type?: WorkOrderType,
  ): Prisma.WorkOrderWhereInput {
    const corretiva = this.filtroSlaCorretiva(bucket);
    const civil = this.filtroSlaCivil(bucket);
    if (type === WorkOrderType.CORRECTIVE) return corretiva;
    if (type === WorkOrderType.PREVENTIVE || type === WorkOrderType.GENERAL) {
      return civil;
    }
    return {
      OR: [
        { type: WorkOrderType.CORRECTIVE, ...corretiva },
        {
          type: { in: [WorkOrderType.PREVENTIVE, WorkOrderType.GENERAL] },
          ...civil,
        },
      ],
    };
  }

  private filtroSlaCorretiva(bucket: ReportSlaBucket): Prisma.WorkOrderWhereInput {
    if (bucket === 'OVERDUE') {
      return { slaStatusExtended: { in: CORRECTIVE_SLA_NEGATIVE_STATUSES } };
    }
    if (bucket === 'NEAR_DUE') {
      return { slaStatusExtended: { in: CORRECTIVE_SLA_NEAR_STATUSES } };
    }
    return {
      slaStatusExtended: { in: CORRECTIVE_SLA_POSITIVE_STATUSES },
    };
  }

  private filtroSlaCivil(bucket: ReportSlaBucket): Prisma.WorkOrderWhereInput {
    if (bucket === 'OVERDUE') {
      return { slaStatus: WorkOrderSlaStatus.OVERDUE };
    }
    if (bucket === 'NEAR_DUE') {
      return { slaStatus: WorkOrderSlaStatus.WARNING };
    }
    return { slaStatus: WorkOrderSlaStatus.OK };
  }

  private montarOrderBy(
    filtros: WorkOrderReportFilterDto,
  ): Prisma.WorkOrderOrderByWithRelationInput {
    const direction = filtros.sortOrder ?? 'desc';
    const campo = filtros.sortBy ?? 'createdAt';
    const permitidos = new Set([
      'sequentialNumber',
      'status',
      'priority',
      'createdAt',
      'startedAt',
      'completedAt',
      'type',
    ]);
    if (!permitidos.has(campo)) {
      return { createdAt: direction };
    }
    return { [campo]: direction };
  }

  private mapearItem(registro: WorkOrderComRelacoes): WorkOrderReportItem {
    const agora = new Date();
    const companyConfig = normalizarConfigEmpresaRelatorio(registro.company);
    const assignee = this.resolverResponsavel(registro);
    const base: WorkOrderReportItem = {
      id: registro.id,
      sequentialNumber: registro.sequentialNumber,
      title: registro.title,
      type: registro.type,
      status: registro.status,
      priority: registro.priority,
      equipmentType: registro.equipmentType,
      location: registro.location
        ? {
            id: registro.location.id,
            name: registro.location.name,
            code: registro.location.code,
            city: registro.location.city ?? null,
            referenceKm: registro.location.referenceKm ?? null,
            regional: registro.location.regional
              ? {
                  id: registro.location.regional.id,
                  name: registro.location.regional.cgr ?? null,
                  cgr: registro.location.regional.cgr ?? null,
                  city: registro.location.regional.city ?? null,
                }
              : null,
          }
        : null,
      createdAt: registro.createdAt.toISOString(),
      startedAt: registro.startedAt?.toISOString() ?? null,
      completedAt: registro.completedAt?.toISOString() ?? null,
      createdByUser: registro.createdByUser
        ? { id: registro.createdByUser.id, name: registro.createdByUser.name }
        : null,
      assignee,
      slaBucket: null,
    };
    if (registro.type === WorkOrderType.CORRECTIVE) {
      const corrective = calcularMetricasCorretiva(
        {
          type: registro.type,
          status: registro.status,
          startedAt: registro.startedAt,
          completedAt: registro.completedAt,
          slaStartAt: registro.slaStartAt,
          slaPausedAt: registro.slaPausedAt,
          slaResumedAt: registro.slaResumedAt,
          slaConsumedSeconds: registro.slaConsumedSeconds,
          slaRemainingSeconds: registro.slaRemainingSeconds,
          slaDeadlineAt: registro.slaDeadlineAt,
          slaDeadlineHours: registro.slaDeadlineHours,
          slaStatusExtended: registro.slaStatusExtended,
          dueDate: registro.dueDate,
          slaStatus: registro.slaStatus,
          pauseHistories: registro.workOrderPauseHistories,
          companyConfig,
        },
        agora,
      );
      base.corrective = corrective;
      base.correctiveLive = {
        slaStartAt: registro.slaStartAt?.toISOString() ?? null,
        slaPausedAt: registro.slaPausedAt?.toISOString() ?? null,
        slaResumedAt: registro.slaResumedAt?.toISOString() ?? null,
        slaConsumedSeconds: registro.slaConsumedSeconds ?? 0,
        slaRemainingSeconds: registro.slaRemainingSeconds,
        slaDeadlineAt: registro.slaDeadlineAt?.toISOString() ?? null,
        slaStatusExtended: registro.slaStatusExtended,
        slaDeadlineHours: registro.slaDeadlineHours,
        correctiveSlaDefaultSeconds: companyConfig.correctiveSlaDefaultSeconds,
        correctiveSlaWindowStart: companyConfig.correctiveSlaWindowStart,
        correctiveSlaWindowEnd: companyConfig.correctiveSlaWindowEnd,
        pauseHistories: registro.workOrderPauseHistories.map((entry) => ({
          eventType: entry.eventType,
          createdAt: entry.createdAt.toISOString(),
        })),
      };
      base.slaBucket = resolverSlaBucketCorretiva(registro.slaStatusExtended);
      return base;
    }
    const dueDateSla = calcularMetricasDueDate(
      {
        dueDate: registro.dueDate,
        status: registro.status,
        completedAt: registro.completedAt,
        slaStatus: registro.slaStatus,
      },
      agora,
    );
    base.dueDateSla = dueDateSla;
    base.slaBucket = dueDateSla.slaBucket;
    return base;
  }

  private resolverResponsavel(
    registro: WorkOrderComRelacoes,
  ): WorkOrderReportUserRef | null {
    for (const fila of registro.workOrderQueues) {
      const filaComUsuarios = fila as {
        queue?: {
          queueUsers?: Array<{ user?: { id: string; name: string } | null }>;
        };
      };
      const usuarios = filaComUsuarios.queue?.queueUsers
        ?.map((item) => item.user)
        .filter((user): user is { id: string; name: string } => Boolean(user));
      if (usuarios && usuarios.length > 0) {
        return { id: usuarios[0].id, name: usuarios[0].name };
      }
    }
    return null;
  }
}
