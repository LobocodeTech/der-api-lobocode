import { Injectable } from '@nestjs/common';
import {
  Prisma,
  WorkOrderCorrectiveSlaStatus,
  WorkOrderPauseHistoryEventType,
  WorkOrderSlaStatus,
  WorkOrderStatus,
  WorkOrderType,
} from '@prisma/client';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { UniversalQueryService } from 'src/shared/universal';
import { construirWorkOrderQueueInclude, WorkOrderQueueUsersService } from '../work-orders/work-order-queue-users/work-order-queue-users.service';
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
  WorkOrderReportActorRef,
  WorkOrderReportExportResponse,
  WorkOrderReportItem,
  WorkOrderReportListResponse,
  WorkOrderReportQueueRef,
  WorkOrderReportSummary,
  WorkOrderReportUserRef,
} from './types/work-order-report.types';
import { resolverIntervaloPeriodoRelatorio } from './utils/work-order-report-period.util';
import {
  calcularMetricasCorretiva,
  calcularMetricasDueDate,
  normalizarConfigEmpresaRelatorio,
  resolverSlaBucketCorretivaLive,
} from './utils/work-order-report-metrics.util';
import { resolverConfigSlaDaOrdem } from '../work-orders/utils/work-order-corrective-sla.util';

const EXPORT_MAX_ROWS = 10_000;
const IN_PROGRESS_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.PAUSED,
  WorkOrderStatus.COMPLETED_UNDER_REVIEW,
];

const WORK_ORDER_REPORT_ACTOR_SELECT = {
  id: true,
  name: true,
  fieldTeamMembers: {
    where: { deletedAt: null },
    select: { id: true, name: true, level: true },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

const RELATORIO_WORK_ORDER_INCLUDE = {
  location: {
    include: {
      regional: {
        select: { id: true, cgr: true, city: true, color: true },
      },
    },
  },
  createdByUser: { select: WORK_ORDER_AUDIT_USER_SELECT },
  startedByUser: { select: WORK_ORDER_REPORT_ACTOR_SELECT },
  completedByUser: { select: WORK_ORDER_REPORT_ACTOR_SELECT },
  approvedByUser: { select: WORK_ORDER_REPORT_ACTOR_SELECT },
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
} as const;

/** Include enriquecido — export completo (abas Excel por OS / OneDrive). */
const RELATORIO_WORK_ORDER_DETALHES_INCLUDE = {
  ...RELATORIO_WORK_ORDER_INCLUDE,
  checklistItems: {
    select: {
      label: true,
      isDone: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  comments: {
    select: {
      text: true,
      createdAt: true,
      author: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  evidences: {
    select: {
      description: true,
      createdAt: true,
      file: {
        select: {
          originalName: true,
          mimeType: true,
          size: true,
          url: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  workOrderPauseHistories: {
    select: {
      eventType: true,
      reason: true,
      createdAt: true,
      pausedByUser: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

type WorkOrderComRelacoes = Awaited<
  ReturnType<WorkOrderReportsService['buscarRegistrosRelatorio']>
>[number];

/** Campos mínimos para recalcular o SLA corretivo ao vivo no resumo. */
const RESUMO_CORRETIVA_SLA_SELECT = {
  type: true,
  status: true,
  startedAt: true,
  completedAt: true,
  finalApprovalCompletedAt: true,
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
    orderBy: { createdAt: 'asc' as const },
  },
  company: {
    select: {
      correctiveSlaDefaultSeconds: true,
      correctiveSlaWindowStart: true,
      correctiveSlaWindowEnd: true,
    },
  },
} satisfies Prisma.WorkOrderSelect;

interface EntradaMetricasCorretivaRegistro {
  type: WorkOrderType;
  status: WorkOrderStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  finalApprovalCompletedAt: Date | null;
  slaStartAt: Date | null;
  slaPausedAt: Date | null;
  slaResumedAt: Date | null;
  slaConsumedSeconds: number | null;
  slaRemainingSeconds: number | null;
  slaDeadlineAt: Date | null;
  slaDeadlineHours: number | null;
  slaStatusExtended: WorkOrderCorrectiveSlaStatus | null;
  dueDate: Date | null;
  slaStatus: WorkOrderSlaStatus | null;
  workOrderPauseHistories: Array<{
    eventType: WorkOrderPauseHistoryEventType;
    createdAt: Date;
  }>;
  company: {
    correctiveSlaDefaultSeconds: number | null;
    correctiveSlaWindowStart: string | null;
    correctiveSlaWindowEnd: string | null;
  } | null;
}

@Injectable()
export class WorkOrderReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryService: UniversalQueryService,
    private readonly workOrderQueueUsersService: WorkOrderQueueUsersService,
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
    const agora = new Date();
    const where = this.montarWhere(filtros);
    const whereCorretiva: Prisma.WorkOrderWhereInput = {
      ...where,
      type: WorkOrderType.CORRECTIVE,
    };
    const wherePreventiva: Prisma.WorkOrderWhereInput = {
      ...where,
      type: WorkOrderType.PREVENTIVE,
    };
    const whereGeral: Prisma.WorkOrderWhereInput = {
      ...where,
      type: WorkOrderType.GENERAL,
    };
    const [
      totalCorretivas,
      corretivasEmAndamento,
      corretivasFinalizadas,
      corretivasAtrasadas,
      totalPreventivas,
      preventivasEmAndamento,
      preventivasFinalizadas,
      totalGerais,
      geraisEmAndamento,
      geraisFinalizadas,
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
          slaStatusExtended: { in: CORRECTIVE_SLA_NEGATIVE_STATUSES },
        },
      }),
      this.prisma.workOrder.count({ where: wherePreventiva }),
      this.prisma.workOrder.count({
        where: {
          ...wherePreventiva,
          status: { in: IN_PROGRESS_STATUSES },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          ...wherePreventiva,
          status: WorkOrderStatus.COMPLETED,
        },
      }),
      this.prisma.workOrder.count({ where: whereGeral }),
      this.prisma.workOrder.count({
        where: {
          ...whereGeral,
          status: { in: IN_PROGRESS_STATUSES },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          ...whereGeral,
          status: WorkOrderStatus.COMPLETED,
        },
      }),
      this.prisma.workOrderPauseHistory.count({
        where: {
          eventType: 'PAUSE',
          workOrder: whereCorretiva,
        },
      }),
      this.prisma.workOrderPauseHistory.count({
        where: {
          eventType: 'RESUME',
          workOrder: whereCorretiva,
        },
      }),
    ]);
    const corretivas = await this.prisma.workOrder.findMany({
      where: whereCorretiva,
      take: EXPORT_MAX_ROWS,
      select: RESUMO_CORRETIVA_SLA_SELECT,
    });
    let slaPositivo = 0;
    let slaNegativo = 0;
    let totalPausedSeconds = 0;
    for (const registro of corretivas) {
      const metricas = calcularMetricasCorretiva(
        this.construirEntradaMetricasCorretiva(registro),
        agora,
      );
      totalPausedSeconds += metricas.totalPausedSeconds;
      if (metricas.isLate) {
        slaNegativo += 1;
        continue;
      }
      if (registro.slaStartAt) {
        slaPositivo += 1;
      }
    }
    // Cumprimento = todas as corretivas COM SLA: cumpridas (concluídas no prazo
    // + ativas dentro do prazo) ÷ total com SLA. OS atrasada (mesmo ativa)
    // derruba o índice.
    const totalComSla = slaPositivo + slaNegativo;
    const complianceRate =
      totalComSla > 0
        ? Number(((slaPositivo / totalComSla) * 100).toFixed(1))
        : 0;
    const preventivaAtrasadas = await this.prisma.workOrder.count({
      where: {
        ...wherePreventiva,
        slaStatus: WorkOrderSlaStatus.OVERDUE,
      },
    });
    const preventivaOnTime = await this.prisma.workOrder.count({
      where: {
        ...wherePreventiva,
        slaStatus: WorkOrderSlaStatus.OK,
      },
    });
    const preventivaNearDue = await this.prisma.workOrder.count({
      where: {
        ...wherePreventiva,
        slaStatus: WorkOrderSlaStatus.WARNING,
      },
    });
    const geralAtrasadas = await this.prisma.workOrder.count({
      where: {
        ...whereGeral,
        slaStatus: WorkOrderSlaStatus.OVERDUE,
      },
    });
    const geralOnTime = await this.prisma.workOrder.count({
      where: {
        ...whereGeral,
        slaStatus: WorkOrderSlaStatus.OK,
      },
    });
    const geralNearDue = await this.prisma.workOrder.count({
      where: {
        ...whereGeral,
        slaStatus: WorkOrderSlaStatus.WARNING,
      },
    });
    const preventivaTotalSla =
      preventivaOnTime + preventivaNearDue + preventivaAtrasadas;
    const preventivaComplianceRate =
      preventivaTotalSla > 0
        ? Number(((preventivaOnTime / preventivaTotalSla) * 100).toFixed(1))
        : 0;
    const geralTotalSla = geralOnTime + geralNearDue + geralAtrasadas;
    const geralComplianceRate =
      geralTotalSla > 0
        ? Number(((geralOnTime / geralTotalSla) * 100).toFixed(1))
        : 0;
    return {
      corrective: {
        total: totalCorretivas,
        inProgress: corretivasEmAndamento,
        completed: corretivasFinalizadas,
        overdue: corretivasAtrasadas,
      },
      preventive: {
        total: totalPreventivas,
        inProgress: preventivasEmAndamento,
        completed: preventivasFinalizadas,
        overdue: preventivaAtrasadas,
      },
      general: {
        total: totalGerais,
        inProgress: geraisEmAndamento,
        completed: geraisFinalizadas,
        overdue: geralAtrasadas,
      },
      sla: {
        positive: slaPositivo,
        negative: slaNegativo,
        complianceRate,
      },
      preventiveSla: {
        onTime: preventivaOnTime,
        nearDue: preventivaNearDue,
        overdue: preventivaAtrasadas,
        complianceRate: preventivaComplianceRate,
      },
      generalSla: {
        onTime: geralOnTime,
        nearDue: geralNearDue,
        overdue: geralAtrasadas,
        complianceRate: geralComplianceRate,
      },
      pauses: {
        totalCount: totalPausasCount,
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
    /** Sempre enriquece no export: abas de OS única / pastas OneDrive por OS. */
    const includeDetalhes = true;
    const registros = await this.buscarRegistrosRelatorio(
      where,
      orderBy,
      0,
      EXPORT_MAX_ROWS,
      includeDetalhes,
    );
    const itens = registros.map((registro) =>
      this.mapearItem(registro, includeDetalhes),
    );
    const isSingleOs = Boolean(filtros.workOrderId?.trim());
    const summary = isSingleOs
      ? {
          corrective: { total: 0, inProgress: 0, completed: 0, overdue: 0 },
          preventive: { total: 0, inProgress: 0, completed: 0, overdue: 0 },
          general: { total: 0, inProgress: 0, completed: 0, overdue: 0 },
          sla: { positive: 0, negative: 0, complianceRate: 0 },
          preventiveSla: {
            onTime: 0,
            nearDue: 0,
            overdue: 0,
            complianceRate: 0,
          },
          generalSla: { onTime: 0, nearDue: 0, overdue: 0, complianceRate: 0 },
          pauses: { totalCount: 0, totalPausedSeconds: 0 },
          returns: { totalCount: 0 },
        }
      : await this.obterResumo(filtros);
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
    includeDetalhes = false,
  ) {
    return this.prisma.workOrder.findMany({
      where,
      orderBy,
      skip,
      take,
      include: includeDetalhes
        ? RELATORIO_WORK_ORDER_DETALHES_INCLUDE
        : RELATORIO_WORK_ORDER_INCLUDE,
    });
  }

  private montarWhere(filtros: WorkOrderReportFilterDto): Prisma.WorkOrderWhereInput {
    if (filtros.workOrderId?.trim()) {
      const baseWhere = this.queryService.construirWhereClauseParaRead(
        'WorkOrder',
        {},
      );
      return { AND: [baseWhere, { id: filtros.workOrderId.trim() }] };
    }
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

  private construirEntradaMetricasCorretiva(
    registro: EntradaMetricasCorretivaRegistro,
  ) {
    return {
      type: registro.type,
      status: registro.status,
      startedAt: registro.startedAt,
      completedAt: registro.finalApprovalCompletedAt ?? registro.completedAt,
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
    };
  }

  private mapearItem(
    registro: WorkOrderComRelacoes,
    includeDetalhes = false,
  ): WorkOrderReportItem {
    const agora = new Date();
    const companyConfig = normalizarConfigEmpresaRelatorio(registro.company);
    const filasMapeadas = this.workOrderQueueUsersService.mapQueuesToResponse(
      registro.workOrderQueues,
    );
    const queues = this.mapearFilasRelatorio(filasMapeadas);
    const assignees =
      this.workOrderQueueUsersService.mapAssigneesFromQueues(filasMapeadas);
    const assignee =
      assignees.length > 0
        ? { id: assignees[0].id, name: assignees[0].name }
        : null;
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
      finalApprovalCompletedAt:
        registro.finalApprovalCompletedAt?.toISOString() ?? null,
      createdByUser: registro.createdByUser
        ? { id: registro.createdByUser.id, name: registro.createdByUser.name }
        : null,
      startedByUser: this.mapearAtorRelatorio(registro.startedByUser),
      completedByUser: this.mapearAtorRelatorio(registro.completedByUser),
      approvedByUser: this.mapearAtorRelatorio(registro.approvedByUser),
      assignee,
      queues,
      slaBucket: null,
    };
    if (includeDetalhes) {
      Object.assign(base, this.mapearDetalhesOsUnica(registro, agora));
    }
    if (registro.type === WorkOrderType.CORRECTIVE) {
      const corrective = calcularMetricasCorretiva(
        this.construirEntradaMetricasCorretiva(registro),
        agora,
      );
      const correctiveConfig = resolverConfigSlaDaOrdem(
        {
          slaDeadlineHours: registro.slaDeadlineHours,
          slaStartAt: registro.slaStartAt,
          slaDeadlineAt: registro.slaDeadlineAt,
          slaConsumedSeconds: registro.slaConsumedSeconds,
          slaRemainingSeconds: registro.slaRemainingSeconds,
          slaExceededAt: registro.slaExceededAt,
          slaStatusExtended: registro.slaStatusExtended,
        },
        companyConfig,
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
        correctiveSlaDefaultSeconds: correctiveConfig.correctiveSlaDefaultSeconds,
        correctiveSlaWindowStart: correctiveConfig.correctiveSlaWindowStart,
        correctiveSlaWindowEnd: correctiveConfig.correctiveSlaWindowEnd,
        pauseHistories: registro.workOrderPauseHistories.map((entry) => ({
          eventType: entry.eventType,
          createdAt: entry.createdAt.toISOString(),
        })),
      };
      base.slaBucket = resolverSlaBucketCorretivaLive(
        corrective.isLate,
        registro.slaStatusExtended,
      );
      return base;
    }
    const dueDateSla = calcularMetricasDueDate(
      {
        dueDate: registro.dueDate,
        status: registro.status,
        completedAt: registro.completedAt,
        slaStatus: registro.slaStatus,
        slaPausedAt: registro.slaPausedAt,
        pauseHistories: registro.workOrderPauseHistories,
      },
      agora,
    );
    base.dueDateSla = dueDateSla;
    base.dueDateLive = {
      slaPausedAt: registro.slaPausedAt?.toISOString() ?? null,
      pauseHistories: registro.workOrderPauseHistories.map((entry) => ({
        eventType: entry.eventType,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
    base.slaBucket = dueDateSla.slaBucket;
    return base;
  }

  private mapearDetalhesOsUnica(
    registro: WorkOrderComRelacoes,
    agora: Date,
  ): Pick<
    WorkOrderReportItem,
    'checklistItems' | 'evidences' | 'pauseEvents' | 'comments'
  > {
    const detalhado = registro as WorkOrderComRelacoes & {
      checklistItems?: Array<{
        label: string;
        isDone: boolean;
        sortOrder: number | null;
        createdAt: Date;
        updatedAt: Date;
      }>;
      evidences?: Array<{
        description: string | null;
        createdAt: Date;
        file: {
          originalName: string;
          mimeType: string;
          size: number;
          url: string;
          createdAt: Date;
          updatedAt: Date;
        } | null;
      }>;
      comments?: Array<{
        text: string;
        createdAt: Date;
        author: { name: string } | null;
      }>;
      workOrderPauseHistories: Array<{
        eventType: string;
        reason?: string;
        createdAt: Date;
        pausedByUser?: { name: string } | null;
      }>;
    };
    const pauseEventsRaw = [...(detalhado.workOrderPauseHistories ?? [])].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const pauseEvents = pauseEventsRaw.map((event, index) => {
      let pausedSeconds: number | null = null;
      if (event.eventType === 'PAUSE') {
        const resume = pauseEventsRaw
          .slice(index + 1)
          .find((item) => item.eventType === 'RESUME');
        const end = resume?.createdAt ?? agora;
        pausedSeconds = Math.max(
          0,
          Math.floor((end.getTime() - event.createdAt.getTime()) / 1000),
        );
      } else if (event.eventType === 'RESUME') {
        const pause = [...pauseEventsRaw]
          .slice(0, index)
          .reverse()
          .find((item) => item.eventType === 'PAUSE');
        if (pause) {
          pausedSeconds = Math.max(
            0,
            Math.floor(
              (event.createdAt.getTime() - pause.createdAt.getTime()) / 1000,
            ),
          );
        }
      }
      return {
        eventType: event.eventType,
        reason: event.reason ?? '',
        authorName: event.pausedByUser?.name ?? null,
        createdAt: event.createdAt.toISOString(),
        pausedSeconds,
      };
    });
    return {
      checklistItems: (detalhado.checklistItems ?? []).map((item) => ({
        label: item.label,
        isDone: item.isDone,
        sortOrder: item.sortOrder,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      evidences: (detalhado.evidences ?? [])
        .filter((item) => item.file)
        .map((item) => ({
          originalName: item.file!.originalName,
          mimeType: item.file!.mimeType,
          description: item.description,
          size: item.file!.size,
          url: item.file!.url,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.file!.updatedAt.toISOString(),
        })),
      pauseEvents,
      comments: (detalhado.comments ?? []).map((comment) => ({
        authorName: comment.author?.name ?? null,
        text: comment.text,
        createdAt: comment.createdAt.toISOString(),
      })),
    };
  }

  private mapearAtorRelatorio(
    ator:
      | {
          id: string;
          name: string;
          fieldTeamMembers: Array<{ id: string; name: string; level: string }>;
        }
      | null
      | undefined,
  ): WorkOrderReportActorRef | null {
    if (!ator) {
      return null;
    }
    return {
      id: ator.id,
      name: ator.name,
      fieldTeamMembers: ator.fieldTeamMembers.map((membro) => ({
        id: membro.id,
        name: membro.name,
        level: membro.level,
      })),
    };
  }

  private mapearFilasRelatorio(
    filas: ReturnType<WorkOrderQueueUsersService['mapQueuesToResponse']>,
  ): WorkOrderReportQueueRef[] {
    return filas.map((fila) => ({
      id: fila.id,
      title: fila.title,
      users: fila.users.map((usuario) => ({
        id: usuario.id,
        name: usuario.name,
      })),
    }));
  }
}
