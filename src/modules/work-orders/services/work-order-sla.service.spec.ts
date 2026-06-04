import { describe, expect, it } from '@jest/globals';
import {
  WorkOrderCorrectiveSlaStatus,
  WorkOrderStatus,
  WorkOrderType,
} from '@prisma/client';
import { WorkOrderSlaService } from './work-order-sla.service';
import { fromBrt } from '../utils/work-order-corrective-sla.util';

describe('WorkOrderSlaService', () => {
  const service = new WorkOrderSlaService();

  it('dispara near breach entre 80% e 100%', () => {
    const snapshot = {
      slaConsumedSeconds: 18_000,
      slaRemainingSeconds: 3_600,
      totalBudgetSeconds: 21_600,
      slaStatusExtended: WorkOrderCorrectiveSlaStatus.NEAR_BREACH,
      slaStartAt: new Date(),
      slaPausedAt: null,
      slaResumedAt: null,
      slaDeadlineAt: new Date(),
      slaExceededAt: null,
    };
    expect(service.deveNotificarNearBreach(snapshot, false)).toBe(true);
    expect(service.deveNotificarNearBreach(snapshot, true)).toBe(false);
  });

  it('dispara uma hora restante quando <= 3600s úteis', () => {
    const snapshot = {
      slaConsumedSeconds: 20_000,
      slaRemainingSeconds: 3_000,
      totalBudgetSeconds: 21_600,
      slaStatusExtended: WorkOrderCorrectiveSlaStatus.IN_PROGRESS,
      slaStartAt: new Date(),
      slaPausedAt: null,
      slaResumedAt: null,
      slaDeadlineAt: new Date(),
      slaExceededAt: null,
    };
    expect(service.deveNotificarUmaHoraRestante(snapshot, false)).toBe(true);
  });

  it('não soma tempo após conclusão quando o consumo já foi congelado', () => {
    const config = service.obterConfigPadrao();
    const slaStartAt = fromBrt(2026, 5, 2, 10, 0, 0, 0);
    const completedAt = fromBrt(2026, 5, 2, 14, 0, 0, 0);
    const congelado = 4 * 3600;

    const snapshot = service.calcularSnapshot(
      {
        type: WorkOrderType.CORRECTIVE,
        status: WorkOrderStatus.COMPLETED,
        slaStartAt,
        slaPausedAt: null,
        slaResumedAt: null,
        slaConsumedSeconds: congelado,
        slaDeadlineAt: fromBrt(2026, 5, 2, 16, 0, 0, 0),
        slaStatusExtended: WorkOrderCorrectiveSlaStatus.COMPLETED_LATE,
        slaExceededAt: completedAt,
        completedAt,
      },
      config,
      fromBrt(2026, 5, 10, 12, 0, 0, 0),
    );

    expect(snapshot?.slaConsumedSeconds).toBe(congelado);
    expect(snapshot?.slaStatusExtended).toBe(
      WorkOrderCorrectiveSlaStatus.COMPLETED_LATE,
    );
  });

  it('ao concluir sem pausas conta tempo útil desde o início do SLA', () => {
    const config = service.obterConfigPadrao();
    const slaStartAt = fromBrt(2026, 5, 2, 10, 0, 0, 0);
    const completedAt = fromBrt(2026, 5, 2, 12, 0, 0, 0);

    const payload = service.aoConcluir(
      {
        type: WorkOrderType.CORRECTIVE,
        status: WorkOrderStatus.COMPLETED,
        slaStartAt,
        slaPausedAt: null,
        slaResumedAt: null,
        slaConsumedSeconds: 0,
        slaDeadlineAt: fromBrt(2026, 5, 2, 16, 0, 0, 0),
        slaStatusExtended: WorkOrderCorrectiveSlaStatus.IN_PROGRESS,
        slaExceededAt: null,
        completedAt,
      },
      config,
      completedAt,
    );

    expect(payload?.slaConsumedSeconds).toBe(2 * 3600);
    expect(payload?.slaStatusExtended).toBe(
      WorkOrderCorrectiveSlaStatus.COMPLETED_ON_TIME,
    );
  });

  it('ao concluir soma o último segmento útil até completedAt', () => {
    const config = service.obterConfigPadrao();
    const slaStartAt = fromBrt(2026, 5, 2, 8, 0, 0, 0);
    const resumedAt = fromBrt(2026, 5, 2, 10, 0, 0, 0);
    const completedAt = fromBrt(2026, 5, 2, 12, 0, 0, 0);
    const base = 2 * 3600;

    const payload = service.aoConcluir(
      {
        type: WorkOrderType.CORRECTIVE,
        status: WorkOrderStatus.COMPLETED,
        slaStartAt,
        slaPausedAt: null,
        slaResumedAt: resumedAt,
        slaConsumedSeconds: base,
        slaDeadlineAt: fromBrt(2026, 5, 2, 16, 0, 0, 0),
        slaStatusExtended: WorkOrderCorrectiveSlaStatus.IN_PROGRESS,
        slaExceededAt: null,
        completedAt,
      },
      config,
      completedAt,
    );

    expect(payload?.slaConsumedSeconds).toBe(base + 2 * 3600);
    expect(payload?.slaResumedAt).toBeNull();
    expect(payload?.slaStatusExtended).toBe(
      WorkOrderCorrectiveSlaStatus.COMPLETED_ON_TIME,
    );
  });

  it('ao pausar congela consumo e não reconta após dias parado', () => {
    const config = service.obterConfigPadrao();
    const slaStartAt = fromBrt(2026, 5, 2, 10, 0, 0, 0);
    const pauseAt = fromBrt(2026, 5, 2, 12, 0, 0, 0);
    const congelado = 2 * 3600;

    const pausePayload = service.aoPausar(
      {
        type: WorkOrderType.CORRECTIVE,
        status: WorkOrderStatus.IN_PROGRESS,
        slaStartAt,
        slaPausedAt: null,
        slaResumedAt: slaStartAt,
        slaConsumedSeconds: 0,
        slaDeadlineAt: fromBrt(2026, 5, 2, 16, 0, 0, 0),
        slaStatusExtended: WorkOrderCorrectiveSlaStatus.IN_PROGRESS,
        slaExceededAt: null,
        completedAt: null,
      },
      config,
      pauseAt,
    );

    expect(pausePayload?.slaConsumedSeconds).toBe(congelado);
    expect(pausePayload?.slaResumedAt).toBeNull();
    expect(pausePayload?.slaStatusExtended).toBe(
      WorkOrderCorrectiveSlaStatus.PAUSED,
    );

    const snapshot = service.calcularSnapshot(
      {
        type: WorkOrderType.CORRECTIVE,
        status: WorkOrderStatus.PAUSED,
        slaStartAt,
        slaPausedAt: pauseAt,
        slaResumedAt: null,
        slaConsumedSeconds: pausePayload?.slaConsumedSeconds ?? 0,
        slaDeadlineAt: fromBrt(2026, 5, 2, 16, 0, 0, 0),
        slaStatusExtended: WorkOrderCorrectiveSlaStatus.PAUSED,
        slaExceededAt: null,
        completedAt: null,
      },
      config,
      fromBrt(2026, 5, 10, 12, 0, 0, 0),
    );

    expect(snapshot?.slaConsumedSeconds).toBe(congelado);
    expect(snapshot?.slaStatusExtended).toBe(
      WorkOrderCorrectiveSlaStatus.PAUSED,
    );
  });

  it('ao retomar não marca atrasado com consumo congelado na pausa', () => {
    const config = service.obterConfigPadrao();
    const slaStartAt = fromBrt(2026, 5, 2, 10, 0, 0, 0);
    const pauseAt = fromBrt(2026, 5, 2, 12, 0, 0, 0);
    const resumeAt = fromBrt(2026, 5, 2, 13, 0, 0, 0);
    const congelado = 2 * 3600;

    const resumePayload = service.aoRetomar(
      {
        type: WorkOrderType.CORRECTIVE,
        status: WorkOrderStatus.PAUSED,
        slaStartAt,
        slaPausedAt: pauseAt,
        slaResumedAt: null,
        slaConsumedSeconds: congelado,
        slaDeadlineAt: fromBrt(2026, 5, 2, 16, 0, 0, 0),
        slaStatusExtended: WorkOrderCorrectiveSlaStatus.PAUSED,
        slaExceededAt: null,
        completedAt: null,
      },
      config,
      resumeAt,
    );

    expect(resumePayload?.slaConsumedSeconds).toBe(congelado);
    expect(resumePayload?.slaResumedAt?.getTime()).toBe(resumeAt.getTime());
    expect(resumePayload?.slaStatusExtended).toBe(
      WorkOrderCorrectiveSlaStatus.IN_PROGRESS,
    );
  });

  it('ao retomar reprojeta o prazo a partir do tempo útil restante', () => {
    const config = service.obterConfigPadrao();
    const slaStartAt = fromBrt(2026, 5, 2, 10, 0, 0, 0);
    const pauseAt = fromBrt(2026, 5, 2, 12, 0, 0, 0);
    const resumeAt = fromBrt(2026, 5, 5, 10, 0, 0, 0);
    const congelado = 2 * 3600;
    const prazoAntigo = fromBrt(2026, 5, 2, 16, 0, 0, 0);

    const resumePayload = service.aoRetomar(
      {
        type: WorkOrderType.CORRECTIVE,
        status: WorkOrderStatus.PAUSED,
        slaStartAt,
        slaPausedAt: pauseAt,
        slaResumedAt: null,
        slaConsumedSeconds: congelado,
        slaDeadlineAt: prazoAntigo,
        slaStatusExtended: WorkOrderCorrectiveSlaStatus.PAUSED,
        slaExceededAt: null,
        completedAt: null,
      },
      config,
      resumeAt,
    );

    expect(resumePayload?.slaDeadlineAt?.getTime()).toBeGreaterThan(
      prazoAntigo.getTime(),
    );
    expect(resumePayload?.slaStatusExtended).not.toBe(
      WorkOrderCorrectiveSlaStatus.BREACHED,
    );
  });
});
