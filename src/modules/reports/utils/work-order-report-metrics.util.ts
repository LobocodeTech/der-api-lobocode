import {
  WorkOrderPauseHistoryEventType,
  WorkOrderSlaStatus,
  WorkOrderStatus,
  WorkOrderType,
} from '@prisma/client';
import {
  calcularConsumidoEfetivoCorretiva,
  calcularSlaNegativoCorretiva,
} from '../../work-orders/utils/work-order-negative-sla.util';
import {
  calcularSegundosUteis,
  normalizarConfigSlaEmpresa,
  resolverConfigSlaDaOrdem,
  type CorrectiveSlaCompanyConfig,
} from '../../work-orders/utils/work-order-corrective-sla.util';
import {
  calcularSlaStatusGeralPreventiva,
  diasRestantesCivisAtePrazo,
} from '../../work-orders/utils/general-preventive-sla.util';
import { instanteFimDoPrazoAPartirDoCampoDate } from '../../work-orders/utils/work-order-due-date.util';
import {
  ReportSlaBucket,
} from '../dto/work-order-report-filter.dto';
import {
  WorkOrderReportCorrectiveMetrics,
  WorkOrderReportDueDateMetrics,
} from '../types/work-order-report.types';

interface PauseHistoryEntry {
  eventType: WorkOrderPauseHistoryEventType;
  createdAt: Date;
}

interface WorkOrderMetricsInput {
  type: WorkOrderType;
  status: WorkOrderStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  finalApprovalCompletedAt?: Date | null;
  slaStartAt: Date | null;
  slaPausedAt: Date | null;
  slaResumedAt: Date | null;
  slaConsumedSeconds: number | null;
  slaRemainingSeconds: number | null;
  slaDeadlineAt: Date | null;
  slaDeadlineHours: number | null;
  slaStatusExtended: string | null;
  dueDate: Date | null;
  slaStatus: WorkOrderSlaStatus | null;
  pauseHistories: PauseHistoryEntry[];
  companyConfig: CorrectiveSlaCompanyConfig;
}

function calcularSegundosEntre(
  inicio: Date | null,
  fim: Date | null,
): number {
  if (!inicio || !fim) return 0;
  const diff = fim.getTime() - inicio.getTime();
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.round(diff / 1000);
}

interface IntervaloAtivo {
  start: Date;
  end: Date;
}

/**
 * Intervalos em que a OS esteve em execução ativa (desde o início do trabalho),
 * excluindo períodos de pausa registrados no histórico.
 */
export function calcularIntervalosAtivosExecucao(
  startedAt: Date,
  fim: Date,
  historico: PauseHistoryEntry[],
  status: WorkOrderStatus,
  slaResumedAt: Date | null = null,
): IntervaloAtivo[] {
  const intervalos: IntervaloAtivo[] = [];
  const eventos = [...historico].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  let ativoDesdeMs = startedAt.getTime();
  const fimMs = fim.getTime();

  for (const evento of eventos) {
    const instanteMs = evento.createdAt.getTime();
    if (evento.eventType === 'PAUSE' && instanteMs > ativoDesdeMs) {
      intervalos.push({
        start: new Date(ativoDesdeMs),
        end: evento.createdAt,
      });
      ativoDesdeMs = instanteMs;
    } else if (evento.eventType === 'RESUME' && instanteMs >= ativoDesdeMs) {
      ativoDesdeMs = instanteMs;
    }
  }

  const pausaAbertaNoHistorico =
    eventos.length > 0 && eventos[eventos.length - 1]?.eventType === 'PAUSE';

  if (
    status !== WorkOrderStatus.PAUSED &&
    !pausaAbertaNoHistorico &&
    ativoDesdeMs < fimMs
  ) {
    if (status === WorkOrderStatus.IN_PROGRESS && slaResumedAt) {
      ativoDesdeMs = Math.max(ativoDesdeMs, slaResumedAt.getTime());
    }
    intervalos.push({ start: new Date(ativoDesdeMs), end: fim });
  }

  return intervalos;
}

function somarSegundosRelogioNosIntervalos(intervalos: IntervaloAtivo[]): number {
  return intervalos.reduce(
    (acc, intervalo) => acc + calcularSegundosEntre(intervalo.start, intervalo.end),
    0,
  );
}

/** Consumo SLA na execução — motor oficial (pausa congela, retomada continua do último ponto). */
function calcularConsumoSlaNaExecucao(
  consumidoTotal: number,
  slaStartAt: Date | null,
  startedAt: Date | null,
  config: CorrectiveSlaCompanyConfig,
): number {
  if (!startedAt || !slaStartAt || startedAt.getTime() <= slaStartAt.getTime()) {
    return consumidoTotal;
  }
  const filaSeconds = calcularSegundosUteis(
    slaStartAt,
    startedAt,
    config.correctiveSlaWindowStart,
    config.correctiveSlaWindowEnd,
  );
  return Math.max(0, consumidoTotal - filaSeconds);
}

export function calcularMetricasPausasRetornos(
  historico: PauseHistoryEntry[],
  status: WorkOrderStatus,
  slaPausedAt: Date | null,
  agora: Date,
): Pick<
  WorkOrderReportCorrectiveMetrics,
  | 'pauseCount'
  | 'totalPausedSeconds'
  | 'firstPauseAt'
  | 'lastPauseAt'
  | 'returnCount'
  | 'firstReturnAt'
  | 'lastReturnAt'
  | 'pausedSeconds'
> {
  const pauses = historico.filter((e) => e.eventType === 'PAUSE');
  const resumes = historico.filter((e) => e.eventType === 'RESUME');
  const ordenado = [...historico].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  let totalPausedSeconds = 0;
  let ultimaPausa: Date | null = null;
  for (const evento of ordenado) {
    if (evento.eventType === 'PAUSE') {
      ultimaPausa = evento.createdAt;
    } else if (evento.eventType === 'RESUME' && ultimaPausa) {
      totalPausedSeconds += calcularSegundosEntre(ultimaPausa, evento.createdAt);
      ultimaPausa = null;
    }
  }
  if (status === WorkOrderStatus.PAUSED) {
    const referencia = slaPausedAt ?? ultimaPausa;
    if (referencia) {
      totalPausedSeconds += calcularSegundosEntre(referencia, agora);
    }
  }
  return {
    pauseCount: pauses.length,
    totalPausedSeconds,
    pausedSeconds: totalPausedSeconds,
    firstPauseAt: pauses[0]?.createdAt.toISOString() ?? null,
    lastPauseAt: pauses[pauses.length - 1]?.createdAt.toISOString() ?? null,
    returnCount: resumes.length,
    firstReturnAt: resumes[0]?.createdAt.toISOString() ?? null,
    lastReturnAt: resumes[resumes.length - 1]?.createdAt.toISOString() ?? null,
  };
}

export function resolverSlaBucketCorretiva(
  slaStatusExtended: string | null,
): ReportSlaBucket {
  if (
    slaStatusExtended === 'BREACHED' ||
    slaStatusExtended === 'COMPLETED_LATE'
  ) {
    return 'OVERDUE';
  }
  if (slaStatusExtended === 'NEAR_BREACH') {
    return 'NEAR_DUE';
  }
  return 'ON_TIME';
}

export function resolverSlaBucketGeralPreventiva(
  slaStatus: WorkOrderSlaStatus,
): ReportSlaBucket {
  if (slaStatus === WorkOrderSlaStatus.OVERDUE) return 'OVERDUE';
  if (slaStatus === WorkOrderSlaStatus.WARNING) return 'NEAR_DUE';
  return 'ON_TIME';
}

export function calcularMetricasCorretiva(
  ordem: WorkOrderMetricsInput,
  agora: Date = new Date(),
): WorkOrderReportCorrectiveMetrics {
  const config = resolverConfigSlaDaOrdem(
    {
      slaDeadlineHours: ordem.slaDeadlineHours,
      slaStartAt: ordem.slaStartAt,
      slaDeadlineAt: ordem.slaDeadlineAt,
      slaConsumedSeconds: ordem.slaConsumedSeconds,
      slaRemainingSeconds: ordem.slaRemainingSeconds,
    },
    ordem.companyConfig,
  );
  const budget = config.correctiveSlaDefaultSeconds;
  const estadoSla = {
    status: ordem.status,
    slaStartAt: ordem.slaStartAt,
    slaDeadlineAt: ordem.slaDeadlineAt,
    slaPausedAt: ordem.slaPausedAt,
    slaResumedAt: ordem.slaResumedAt,
    slaConsumedSeconds: ordem.slaConsumedSeconds,
    slaStatusExtended: ordem.slaStatusExtended as never,
    completedAt: ordem.completedAt,
    finalApprovalCompletedAt: ordem.finalApprovalCompletedAt ?? null,
  };
  const consumedTotalSeconds = calcularConsumidoEfetivoCorretiva(
    estadoSla,
    config,
    agora,
  );
  const negativo = calcularSlaNegativoCorretiva(
    estadoSla,
    config,
    budget,
    agora,
  );
  const conclusaoOficial =
    ordem.finalApprovalCompletedAt ?? ordem.completedAt;
  const fimExecucao =
    ordem.status === WorkOrderStatus.COMPLETED ||
    ordem.status === WorkOrderStatus.CANCELLED
      ? conclusaoOficial ?? agora
      : ordem.startedAt
        ? agora
        : null;
  const pausas = calcularMetricasPausasRetornos(
    ordem.pauseHistories,
    ordem.status,
    ordem.slaPausedAt,
    agora,
  );

  const workedSeconds = consumedTotalSeconds;

  let totalExecutionSeconds = 0;
  if (ordem.startedAt && fimExecucao) {
    const intervalosAtivos = calcularIntervalosAtivosExecucao(
      ordem.startedAt,
      fimExecucao,
      ordem.pauseHistories,
      ordem.status,
      ordem.slaResumedAt,
    );
    totalExecutionSeconds = somarSegundosRelogioNosIntervalos(intervalosAtivos);
  }

  const slaPositiveSeconds = negativo.isOverdue
    ? 0
    : Math.max(0, budget - consumedTotalSeconds);
  const withinSlaSeconds = slaPositiveSeconds;
  const slaNegativeSeconds = negativo.overdueSeconds;
  const latePercentOfSla =
    budget > 0 ? Number(((slaNegativeSeconds / budget) * 100).toFixed(1)) : 0;
  return {
    totalExecutionSeconds,
    workedSeconds,
    overdueSeconds: slaNegativeSeconds,
    withinSlaSeconds,
    slaPositiveSeconds,
    slaNegativeSeconds,
    ...pausas,
    isLate: negativo.isOverdue,
    lateSeconds: slaNegativeSeconds,
    latePercentOfSla,
  };
}

export function calcularMetricasDueDate(
  ordem: Pick<
    WorkOrderMetricsInput,
    'dueDate' | 'status' | 'completedAt' | 'slaStatus'
  >,
  agora: Date = new Date(),
): WorkOrderReportDueDateMetrics {
  const slaStatus = ordem.dueDate
    ? calcularSlaStatusGeralPreventiva(
        ordem.dueDate,
        ordem.status,
        agora,
        ordem.completedAt,
      )
    : ordem.slaStatus ?? WorkOrderSlaStatus.OK;
  const fimPrazo = ordem.dueDate
    ? instanteFimDoPrazoAPartirDoCampoDate(ordem.dueDate)
    : null;
  let remainingSeconds = 0;
  let exceededSeconds = 0;
  if (fimPrazo) {
    if (slaStatus === WorkOrderSlaStatus.OVERDUE) {
      const referencia =
        ordem.status === WorkOrderStatus.COMPLETED && ordem.completedAt
          ? ordem.completedAt
          : agora;
      exceededSeconds = Math.max(
        0,
        Math.round((referencia.getTime() - fimPrazo.getTime()) / 1000),
      );
    } else if (ordem.dueDate) {
      const dias = diasRestantesCivisAtePrazo(ordem.dueDate, agora);
      remainingSeconds = dias * 24 * 60 * 60;
    }
  }
  return {
    slaBucket: resolverSlaBucketGeralPreventiva(slaStatus),
    slaStatus,
    dueDate: ordem.dueDate?.toISOString().slice(0, 10) ?? null,
    remainingSeconds,
    exceededSeconds,
  };
}

export function normalizarConfigEmpresaRelatorio(
  company: {
    correctiveSlaDefaultSeconds?: number | null;
    correctiveSlaWindowStart?: string | null;
    correctiveSlaWindowEnd?: string | null;
  } | null | undefined,
): CorrectiveSlaCompanyConfig {
  if (!company) {
    return normalizarConfigSlaEmpresa(undefined);
  }
  return normalizarConfigSlaEmpresa({
    correctiveSlaDefaultSeconds:
      company.correctiveSlaDefaultSeconds ?? undefined,
    correctiveSlaWindowStart: company.correctiveSlaWindowStart ?? undefined,
    correctiveSlaWindowEnd: company.correctiveSlaWindowEnd ?? undefined,
  });
}
