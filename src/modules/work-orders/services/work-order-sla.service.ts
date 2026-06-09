import { Injectable } from '@nestjs/common';
import {
  WorkOrderCorrectiveSlaStatus,
  WorkOrderStatus,
  WorkOrderType,
} from '@prisma/client';
import {
  calcularDeadlineSla,
  calcularInicioEfetivoSla,
  calcularSegundosUteis,
  DEFAULT_CORRECTIVE_SLA_SECONDS,
  DEFAULT_WINDOW_END,
  DEFAULT_WINDOW_START,
  empacotarJanelaSla,
  NEAR_BREACH_RATIO,
  normalizarConfigSlaEmpresa,
  ONE_HOUR_USEFUL_SECONDS,
  type CorrectiveSlaCompanyConfig,
} from '../utils/work-order-corrective-sla.util';

export interface CorrectiveSlaWorkOrderState {
  type: WorkOrderType;
  status: WorkOrderStatus;
  slaStartAt: Date | null;
  slaPausedAt: Date | null;
  slaResumedAt: Date | null;
  slaConsumedSeconds: number | null;
  slaDeadlineAt: Date | null;
  slaStatusExtended: WorkOrderCorrectiveSlaStatus | null;
  slaExceededAt: Date | null;
  completedAt: Date | null;
}

export interface CorrectiveSlaSnapshot {
  slaStartAt: Date | null;
  slaPausedAt: Date | null;
  slaResumedAt: Date | null;
  slaConsumedSeconds: number;
  slaRemainingSeconds: number;
  slaDeadlineAt: Date | null;
  slaStatusExtended: WorkOrderCorrectiveSlaStatus;
  slaExceededAt: Date | null;
  totalBudgetSeconds: number;
}

export interface CorrectiveSlaPersistPayload {
  slaStartAt?: Date | null;
  slaPausedAt?: Date | null;
  slaResumedAt?: Date | null;
  slaConsumedSeconds: number;
  slaRemainingSeconds: number;
  slaDeadlineAt: Date | null;
  slaStatusExtended: WorkOrderCorrectiveSlaStatus;
  slaExceededAt: Date | null;
  /** Janela operacional empacotada (somente OS corretivas). */
  slaDeadlineHours?: number;
}

@Injectable()
export class WorkOrderSlaService {
  ehOsCorretiva(type: WorkOrderType): boolean {
    return type === WorkOrderType.CORRECTIVE;
  }

  obterConfigPadrao(): CorrectiveSlaCompanyConfig {
    return normalizarConfigSlaEmpresa({
      correctiveSlaDefaultSeconds: DEFAULT_CORRECTIVE_SLA_SECONDS,
      correctiveSlaWindowStart: DEFAULT_WINDOW_START,
      correctiveSlaWindowEnd: DEFAULT_WINDOW_END,
    });
  }

  inicializarSlaNaCriacao(
    createdAt: Date,
    companyConfig: CorrectiveSlaCompanyConfig,
  ): CorrectiveSlaPersistPayload {
    const config = normalizarConfigSlaEmpresa(companyConfig);
    const slaStartAt = calcularInicioEfetivoSla(
      createdAt,
      config.correctiveSlaWindowStart,
      config.correctiveSlaWindowEnd,
    );
    const slaDeadlineAt = calcularDeadlineSla(
      slaStartAt,
      config.correctiveSlaDefaultSeconds,
      config.correctiveSlaWindowStart,
      config.correctiveSlaWindowEnd,
    );

    return {
      slaStartAt,
      slaPausedAt: null,
      slaResumedAt: null,
      slaConsumedSeconds: 0,
      slaRemainingSeconds: config.correctiveSlaDefaultSeconds,
      slaDeadlineAt,
      slaStatusExtended: WorkOrderCorrectiveSlaStatus.IN_PROGRESS,
      slaExceededAt: null,
      slaDeadlineHours: empacotarJanelaSla(
        config.correctiveSlaWindowStart,
        config.correctiveSlaWindowEnd,
      ),
    };
  }

  calcularSnapshot(
    ordem: CorrectiveSlaWorkOrderState,
    companyConfig: CorrectiveSlaCompanyConfig,
    agora: Date = new Date(),
    opcoes?: { preservarDeadlinePersistido?: boolean },
  ): CorrectiveSlaSnapshot | null {
    if (!this.ehOsCorretiva(ordem.type)) {
      return null;
    }

    const config = normalizarConfigSlaEmpresa(companyConfig);
    const budget = config.correctiveSlaDefaultSeconds;
    const slaStartAt = ordem.slaStartAt;

    if (!slaStartAt) {
      return null;
    }

    const consumed = this.calcularConsumidoAtual(ordem, config, agora);
    const remaining = Math.max(0, budget - consumed);
    const slaDeadlineAt = this.resolverDeadlineSla(
      ordem,
      slaStartAt,
      budget,
      remaining,
      config,
      opcoes?.preservarDeadlinePersistido ?? false,
    );

    let slaExceededAt = ordem.slaExceededAt;
    if (!slaExceededAt && consumed >= budget) {
      slaExceededAt = agora;
    }

    const slaStatusExtended = this.derivarStatus(
      ordem,
      consumed,
      budget,
      agora,
    );

    return {
      slaStartAt,
      slaPausedAt: ordem.slaPausedAt,
      slaResumedAt: ordem.slaResumedAt,
      slaConsumedSeconds: consumed,
      slaRemainingSeconds: remaining,
      slaDeadlineAt,
      slaStatusExtended,
      slaExceededAt,
      totalBudgetSeconds: budget,
    };
  }

  snapshotParaPersistencia(
    snapshot: CorrectiveSlaSnapshot,
  ): CorrectiveSlaPersistPayload {
    return {
      slaStartAt: snapshot.slaStartAt,
      slaPausedAt: snapshot.slaPausedAt,
      slaResumedAt: snapshot.slaResumedAt,
      slaConsumedSeconds: snapshot.slaConsumedSeconds,
      slaRemainingSeconds: snapshot.slaRemainingSeconds,
      slaDeadlineAt: snapshot.slaDeadlineAt,
      slaStatusExtended: snapshot.slaStatusExtended,
      slaExceededAt: snapshot.slaExceededAt,
    };
  }

  aoPausar(
    ordem: CorrectiveSlaWorkOrderState,
    companyConfig: CorrectiveSlaCompanyConfig,
    agora: Date = new Date(),
  ): CorrectiveSlaPersistPayload | null {
    const config = normalizarConfigSlaEmpresa(companyConfig);
    const emAndamento: CorrectiveSlaWorkOrderState = {
      ...ordem,
      status: WorkOrderStatus.IN_PROGRESS,
      slaPausedAt: null,
    };
    const consumed = this.calcularConsumidoAtual(emAndamento, config, agora);
    const budget = config.correctiveSlaDefaultSeconds;
    const remaining = Math.max(0, budget - consumed);
    const slaDeadlineAt =
      ordem.slaDeadlineAt ??
      (ordem.slaStartAt
        ? calcularDeadlineSla(
            ordem.slaStartAt,
            budget,
            config.correctiveSlaWindowStart,
            config.correctiveSlaWindowEnd,
          )
        : null);

    let slaExceededAt = ordem.slaExceededAt;
    if (!slaExceededAt && consumed >= budget) {
      slaExceededAt = agora;
    }

    return {
      slaStartAt: ordem.slaStartAt,
      slaPausedAt: agora,
      slaResumedAt: null,
      slaConsumedSeconds: consumed,
      slaRemainingSeconds: remaining,
      slaDeadlineAt,
      slaStatusExtended: WorkOrderCorrectiveSlaStatus.PAUSED,
      slaExceededAt,
      slaDeadlineHours: empacotarJanelaSla(
        config.correctiveSlaWindowStart,
        config.correctiveSlaWindowEnd,
      ),
    };
  }

  aoRetomar(
    ordem: CorrectiveSlaWorkOrderState,
    companyConfig: CorrectiveSlaCompanyConfig,
    agora: Date = new Date(),
  ): CorrectiveSlaPersistPayload | null {
    const config = normalizarConfigSlaEmpresa(companyConfig);
    const base = ordem.slaConsumedSeconds ?? 0;
    const resumed: CorrectiveSlaWorkOrderState = {
      ...ordem,
      status: WorkOrderStatus.IN_PROGRESS,
      slaPausedAt: null,
      slaResumedAt: agora,
      slaConsumedSeconds: base,
    };
    const snapshot = this.calcularSnapshot(resumed, companyConfig, agora);
    if (!snapshot) return null;

    const budget = config.correctiveSlaDefaultSeconds;
    const foiVencida =
      base >= budget ||
      ordem.slaExceededAt != null ||
      ordem.slaStatusExtended === WorkOrderCorrectiveSlaStatus.BREACHED;
    const remaining = Math.max(0, budget - base);
    const slaDeadlineAt = foiVencida
      ? (ordem.slaDeadlineAt ??
        (ordem.slaStartAt
          ? calcularDeadlineSla(
              ordem.slaStartAt,
              budget,
              config.correctiveSlaWindowStart,
              config.correctiveSlaWindowEnd,
            )
          : null))
      : calcularDeadlineSla(
          agora,
          remaining,
          config.correctiveSlaWindowStart,
          config.correctiveSlaWindowEnd,
        );
    const slaExceededAt =
      ordem.slaExceededAt ?? (foiVencida ? agora : snapshot.slaExceededAt);
    const slaStatusExtended = foiVencida
      ? WorkOrderCorrectiveSlaStatus.BREACHED
      : snapshot.slaStatusExtended;

    return {
      ...this.snapshotParaPersistencia({
        ...snapshot,
        slaRemainingSeconds: remaining,
        slaDeadlineAt,
        slaStatusExtended,
        slaExceededAt,
      }),
      slaPausedAt: null,
      slaResumedAt: agora,
      slaConsumedSeconds: base,
      slaDeadlineAt,
      slaRemainingSeconds: remaining,
      slaStatusExtended,
      slaExceededAt,
      slaDeadlineHours: empacotarJanelaSla(
        config.correctiveSlaWindowStart,
        config.correctiveSlaWindowEnd,
      ),
    };
  }

  aoConcluir(
    ordem: CorrectiveSlaWorkOrderState,
    companyConfig: CorrectiveSlaCompanyConfig,
    agora: Date = new Date(),
  ): CorrectiveSlaPersistPayload | null {
    const snapshot = this.calcularSnapshot(ordem, companyConfig, agora);
    if (!snapshot) return null;

    const budget = snapshot.totalBudgetSeconds;
    const onTime =
      snapshot.slaConsumedSeconds < budget ||
      (snapshot.slaExceededAt == null && snapshot.slaConsumedSeconds <= budget);

    return {
      ...this.snapshotParaPersistencia({
        ...snapshot,
        slaStatusExtended: onTime
          ? WorkOrderCorrectiveSlaStatus.COMPLETED_ON_TIME
          : WorkOrderCorrectiveSlaStatus.COMPLETED_LATE,
      }),
      slaPausedAt: null,
      slaResumedAt: null,
      slaRemainingSeconds: Math.max(
        0,
        budget - snapshot.slaConsumedSeconds,
      ),
    };
  }

  deveNotificarNearBreach(
    snapshot: CorrectiveSlaSnapshot,
    jaNotificado: boolean,
  ): boolean {
    if (jaNotificado) return false;
    if (
      snapshot.slaStatusExtended === WorkOrderCorrectiveSlaStatus.COMPLETED_ON_TIME ||
      snapshot.slaStatusExtended === WorkOrderCorrectiveSlaStatus.COMPLETED_LATE ||
      snapshot.slaStatusExtended === WorkOrderCorrectiveSlaStatus.PAUSED
    ) {
      return false;
    }
    const ratio =
      snapshot.slaConsumedSeconds / Math.max(1, snapshot.totalBudgetSeconds);
    return ratio >= NEAR_BREACH_RATIO && ratio < 1;
  }

  deveNotificarUmaHoraRestante(
    snapshot: CorrectiveSlaSnapshot,
    jaNotificado: boolean,
  ): boolean {
    if (jaNotificado) return false;
    return (
      snapshot.slaRemainingSeconds > 0 &&
      snapshot.slaRemainingSeconds <= ONE_HOUR_USEFUL_SECONDS &&
      snapshot.slaStatusExtended !== WorkOrderCorrectiveSlaStatus.BREACHED
    );
  }

  deveNotificarBreached(
    snapshot: CorrectiveSlaSnapshot,
    jaNotificado: boolean,
  ): boolean {
    if (jaNotificado) return false;
    return (
      snapshot.slaStatusExtended === WorkOrderCorrectiveSlaStatus.BREACHED ||
      snapshot.slaConsumedSeconds >= snapshot.totalBudgetSeconds
    );
  }

  /**
   * Prazo limite em tempo útil. Após retomada, reprojeta a partir do retorno
   * (o vencimento não pode ficar no passado só porque a OS ficou pausada).
   */
  private resolverDeadlineSla(
    ordem: CorrectiveSlaWorkOrderState,
    slaStartAt: Date,
    budgetSeconds: number,
    remainingSeconds: number,
    config: CorrectiveSlaCompanyConfig,
    preservarDeadlinePersistido = false,
  ): Date {
    const { correctiveSlaWindowStart, correctiveSlaWindowEnd } = config;

    if (preservarDeadlinePersistido && ordem.slaDeadlineAt) {
      return ordem.slaDeadlineAt;
    }

    if (
      ordem.status === WorkOrderStatus.IN_PROGRESS &&
      ordem.slaResumedAt &&
      remainingSeconds > 0 &&
      !preservarDeadlinePersistido
    ) {
      return calcularDeadlineSla(
        ordem.slaResumedAt,
        remainingSeconds,
        correctiveSlaWindowStart,
        correctiveSlaWindowEnd,
      );
    }

    if (ordem.slaDeadlineAt) {
      return ordem.slaDeadlineAt;
    }

    return calcularDeadlineSla(
      slaStartAt,
      budgetSeconds,
      correctiveSlaWindowStart,
      correctiveSlaWindowEnd,
    );
  }

  private calcularConsumidoAtual(
    ordem: CorrectiveSlaWorkOrderState,
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
        ordem.slaStatusExtended ===
          WorkOrderCorrectiveSlaStatus.COMPLETED_LATE
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

  private derivarStatus(
    ordem: CorrectiveSlaWorkOrderState,
    consumed: number,
    budget: number,
    agora: Date,
  ): WorkOrderCorrectiveSlaStatus {
    if (ordem.status === WorkOrderStatus.COMPLETED) {
      if (
        ordem.slaStatusExtended ===
          WorkOrderCorrectiveSlaStatus.COMPLETED_ON_TIME ||
        ordem.slaStatusExtended === WorkOrderCorrectiveSlaStatus.COMPLETED_LATE
      ) {
        return ordem.slaStatusExtended;
      }
      const exceeded =
        ordem.slaExceededAt != null ||
        consumed >= budget ||
        (ordem.completedAt &&
          ordem.slaDeadlineAt &&
          ordem.completedAt > ordem.slaDeadlineAt);
      return exceeded
        ? WorkOrderCorrectiveSlaStatus.COMPLETED_LATE
        : WorkOrderCorrectiveSlaStatus.COMPLETED_ON_TIME;
    }

    if (ordem.status === WorkOrderStatus.PAUSED) {
      return WorkOrderCorrectiveSlaStatus.PAUSED;
    }

    if (consumed >= budget) {
      return WorkOrderCorrectiveSlaStatus.BREACHED;
    }

    if (consumed >= budget * NEAR_BREACH_RATIO) {
      return WorkOrderCorrectiveSlaStatus.NEAR_BREACH;
    }

    return WorkOrderCorrectiveSlaStatus.IN_PROGRESS;
  }
}
