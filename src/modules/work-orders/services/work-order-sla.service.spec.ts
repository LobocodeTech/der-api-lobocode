import { describe, expect, it } from '@jest/globals';
import { WorkOrderCorrectiveSlaStatus } from '@prisma/client';
import { WorkOrderSlaService } from './work-order-sla.service';

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
});
