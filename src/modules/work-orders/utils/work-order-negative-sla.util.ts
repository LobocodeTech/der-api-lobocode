import {
  WorkOrderCorrectiveSlaStatus,
  WorkOrderStatus,
} from '@prisma/client';
import {
  calcularSegundosUteis,
  type CorrectiveSlaCompanyConfig,
} from './work-order-corrective-sla.util';

export type CorrectiveSlaOverdueStatus = 'ACTIVE' | 'PAUSED' | 'FROZEN';

export interface CorrectiveSlaNegativeState {
  status: WorkOrderStatus;
  slaStartAt: Date | null;
  slaDeadlineAt: Date | null;
  slaPausedAt: Date | null;
  slaResumedAt: Date | null;
  slaConsumedSeconds: number | null;
  slaStatusExtended: WorkOrderCorrectiveSlaStatus | null;
  completedAt: Date | null;
  finalApprovalCompletedAt?: Date | null;
}

function resolverFimConsumoSlaNegativo(
  ordem: CorrectiveSlaNegativeState,
  agora: Date,
): Date {
  if (ordem.status === WorkOrderStatus.COMPLETED) {
    return ordem.finalApprovalCompletedAt ?? ordem.completedAt ?? agora;
  }
  if (ordem.status === WorkOrderStatus.CANCELLED) {
    return ordem.completedAt ?? agora;
  }
  return agora;
}

function statusEncerraConsumoSlaNegativo(status: WorkOrderStatus): boolean {
  return (
    status === WorkOrderStatus.COMPLETED ||
    status === WorkOrderStatus.CANCELLED
  );
}

/**
 * Atraso (SLA negativo) contado em tempo CORRIDO (24h/dia) a partir do Limite —
 * começa quando o SLA Positivo termina (`slaDeadlineAt`) e NÃO para na janela
 * operacional nem nas pausas. Encerradas congelam na conclusão; ativas e
 * pausadas continuam correndo até "agora".
 */
export function calcularSegundosAtrasoExcedenteCorretiva(
  ordem: CorrectiveSlaNegativeState,
  consumed: number,
  budgetSeconds: number,
  agora: Date,
): number {
  const porConsumo = Math.max(0, consumed - budgetSeconds);

  const slaDeadlineAt = ordem.slaDeadlineAt;
  if (!slaDeadlineAt) {
    return porConsumo;
  }

  // Pausada antes de consumir o orçamento: o SLA Positivo ainda não terminou,
  // então não há SLA Negativo — mesmo que o relógio passe do limite persistido.
  if (ordem.status === WorkOrderStatus.PAUSED && consumed < budgetSeconds) {
    return 0;
  }

  // Encerradas usam a conclusão; ativas e pausadas usam "agora" (corrido).
  const fimReferencia = statusEncerraConsumoSlaNegativo(ordem.status)
    ? resolverFimConsumoSlaNegativo(ordem, agora)
    : agora;

  if (fimReferencia.getTime() <= slaDeadlineAt.getTime()) {
    return 0;
  }

  // Tempo CORRIDO (24h/dia) entre o Limite e o marco final — sem desconto de
  // janela operacional nem de pausas.
  return Math.floor(
    (fimReferencia.getTime() - slaDeadlineAt.getTime()) / 1000,
  );
}

export interface CorrectiveSlaNegativeSnapshot {
  isOverdue: boolean;
  overdueSeconds: number;
  overdueStatus: CorrectiveSlaOverdueStatus | null;
}

/** Consumo efetivo em tempo útil — espelha `WorkOrderSlaService.calcularConsumidoAtual`. */
export function calcularConsumidoEfetivoCorretiva(
  ordem: CorrectiveSlaNegativeState,
  config: CorrectiveSlaCompanyConfig,
  agora: Date,
): number {
  const base = Math.max(0, ordem.slaConsumedSeconds ?? 0);
  const slaStartAt = ordem.slaStartAt;
  if (!slaStartAt) {
    return base;
  }

  if (
    ordem.status === WorkOrderStatus.PAUSED ||
    (ordem.slaPausedAt && !ordem.slaResumedAt)
  ) {
    return base;
  }

  const fim = resolverFimConsumoSlaNegativo(ordem, agora);

  if (statusEncerraConsumoSlaNegativo(ordem.status)) {
    if (ordem.slaPausedAt) {
      return base;
    }
    if (
      ordem.slaStatusExtended ===
        WorkOrderCorrectiveSlaStatus.COMPLETED_ON_TIME ||
      ordem.slaStatusExtended === WorkOrderCorrectiveSlaStatus.COMPLETED_LATE
    ) {
      return base;
    }
    if (!ordem.slaResumedAt) {
      if (base > 0) {
        return base;
      }
      return calcularSegundosUteis(
        slaStartAt,
        fim,
        config.correctiveSlaWindowStart,
        config.correctiveSlaWindowEnd,
      );
    }
    const extra = calcularSegundosUteis(
      ordem.slaResumedAt,
      fim,
      config.correctiveSlaWindowStart,
      config.correctiveSlaWindowEnd,
    );
    return base + extra;
  }

  if (ordem.slaResumedAt) {
    return (
      base +
      calcularSegundosUteis(
        ordem.slaResumedAt,
        fim,
        config.correctiveSlaWindowStart,
        config.correctiveSlaWindowEnd,
      )
    );
  }

  return calcularSegundosUteis(
    slaStartAt,
    fim,
    config.correctiveSlaWindowStart,
    config.correctiveSlaWindowEnd,
  );
}

export function calcularSlaNegativoCorretiva(
  ordem: CorrectiveSlaNegativeState,
  config: CorrectiveSlaCompanyConfig,
  budgetSeconds: number,
  agora: Date = new Date(),
): CorrectiveSlaNegativeSnapshot {
  if (!ordem.slaStartAt || budgetSeconds <= 0) {
    return {
      isOverdue: false,
      overdueSeconds: 0,
      overdueStatus: null,
    };
  }

  const consumed = calcularConsumidoEfetivoCorretiva(ordem, config, agora);
  const overdueSeconds = calcularSegundosAtrasoExcedenteCorretiva(
    ordem,
    consumed,
    budgetSeconds,
    agora,
  );

  if (overdueSeconds <= 0) {
    return {
      isOverdue: false,
      overdueSeconds: 0,
      overdueStatus: null,
    };
  }

  if (statusEncerraConsumoSlaNegativo(ordem.status)) {
    return {
      isOverdue: true,
      overdueSeconds,
      overdueStatus: 'FROZEN',
    };
  }

  // Pausada também acumula SLA Negativo (corrido 24h), portanto continua ativo.
  return {
    isOverdue: true,
    overdueSeconds,
    overdueStatus: 'ACTIVE',
  };
}
