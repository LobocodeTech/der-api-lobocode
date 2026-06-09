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
}

/**
 * Atraso excedente alinhado ao par Limite × Conclusão (tempo útil após o deadline).
 * Evita divergência por arredondamento acumulado em consumido − orçamento.
 */
export function calcularSegundosAtrasoExcedenteCorretiva(
  ordem: CorrectiveSlaNegativeState,
  config: CorrectiveSlaCompanyConfig,
  consumed: number,
  budgetSeconds: number,
  agora: Date,
): number {
  const porConsumo = Math.max(0, consumed - budgetSeconds);
  const { correctiveSlaWindowStart, correctiveSlaWindowEnd } = config;

  if (ordem.status === WorkOrderStatus.PAUSED) {
    return porConsumo;
  }

  const slaDeadlineAt = ordem.slaDeadlineAt;
  if (!slaDeadlineAt) {
    return porConsumo;
  }

  const fimReferencia =
    ordem.status === WorkOrderStatus.COMPLETED ||
    ordem.status === WorkOrderStatus.CANCELLED
      ? ordem.completedAt
      : agora;

  if (!fimReferencia || fimReferencia.getTime() <= slaDeadlineAt.getTime()) {
    return porConsumo;
  }

  const porLimite = calcularSegundosUteis(
    slaDeadlineAt,
    fimReferencia,
    correctiveSlaWindowStart,
    correctiveSlaWindowEnd,
  );

  return Math.max(porConsumo, porLimite);
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

  if (ordem.status === WorkOrderStatus.PAUSED) {
    return base;
  }

  const fim =
    ordem.status === WorkOrderStatus.COMPLETED ||
    ordem.status === WorkOrderStatus.CANCELLED
      ? (ordem.completedAt ?? agora)
      : agora;

  if (
    ordem.status === WorkOrderStatus.COMPLETED ||
    ordem.status === WorkOrderStatus.CANCELLED
  ) {
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
    config,
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

  if (
    ordem.status === WorkOrderStatus.COMPLETED ||
    ordem.status === WorkOrderStatus.CANCELLED
  ) {
    return {
      isOverdue: true,
      overdueSeconds,
      overdueStatus: 'FROZEN',
    };
  }

  if (ordem.status === WorkOrderStatus.PAUSED) {
    return {
      isOverdue: true,
      overdueSeconds,
      overdueStatus: 'PAUSED',
    };
  }

  return {
    isOverdue: true,
    overdueSeconds,
    overdueStatus: 'ACTIVE',
  };
}
