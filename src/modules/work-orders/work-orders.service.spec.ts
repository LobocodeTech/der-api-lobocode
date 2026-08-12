import {
  WorkOrderCorrectiveSlaStatus,
  WorkOrderStatus,
} from '@prisma/client';
import { describe, expect, it } from '@jest/globals';
import { WorkOrdersService } from './work-orders.service';

describe('WorkOrdersService - filtro de SLA atrasado', () => {
  const companyConfig = {
    correctiveSlaDefaultSeconds: 43_200,
    correctiveSlaWindowStart: '06:00',
    correctiveSlaWindowEnd: '18:00',
  };
  const agora = new Date('2026-08-12T15:00:00.000Z');
  const registroEstaAtrasadoAoVivo = (
    (
      WorkOrdersService.prototype as unknown as {
        registroEstaAtrasadoAoVivo?(
          registro: Record<string, unknown>,
          config: typeof companyConfig,
          agora: Date,
        ): boolean;
      }
    ).registroEstaAtrasadoAoVivo
  );

  it('distingue preventiva concluída no prazo de preventiva concluída atrasada', () => {
    const base = {
      type: 'PREVENTIVE',
      status: WorkOrderStatus.COMPLETED,
      dueDate: new Date('2026-08-10T03:00:00.000Z'),
      slaStatus: 'OK',
    };

    const concluidaNoPrazo = registroEstaAtrasadoAoVivo?.(
      {
        ...base,
        completedAt: new Date('2026-08-10T20:00:00.000Z'),
      },
      companyConfig,
      agora,
    );
    const concluidaAtrasada = registroEstaAtrasadoAoVivo?.(
      {
        ...base,
        completedAt: new Date('2026-08-11T03:00:00.000Z'),
      },
      companyConfig,
      agora,
    );

    expect(concluidaNoPrazo).toBe(false);
    expect(concluidaAtrasada).toBe(true);
  });

  it('conta corretiva ativa cujo limite venceu sem status persistido', () => {
    const atrasada = registroEstaAtrasadoAoVivo?.(
      {
        type: 'CORRECTIVE',
        status: WorkOrderStatus.IN_PROGRESS,
        slaStartAt: new Date('2026-08-10T09:00:00.000Z'),
        slaDeadlineAt: new Date('2026-08-11T15:00:00.000Z'),
        slaPausedAt: null,
        slaResumedAt: null,
        slaConsumedSeconds: 10_800,
        slaStatusExtended: WorkOrderCorrectiveSlaStatus.IN_PROGRESS,
        slaExceededAt: null,
        completedAt: null,
        finalApprovalCompletedAt: null,
      },
      companyConfig,
      agora,
    );

    expect(atrasada).toBe(true);
  });
});
