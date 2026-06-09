import { WorkOrderCorrectiveSlaStatus, WorkOrderType } from '@prisma/client';
import type { CorrectiveSlaOverdueStatus } from '../utils/work-order-negative-sla.util';

/**
 * Campos de SLA corretiva expostos nas respostas de OS (`type === CORRECTIVE`).
 * Calculados/atualizados pelo backend; não são aceitos em DTOs de escrita.
 */
export interface WorkOrderCorrectiveSlaResponseFields {
  slaStartAt: string | null;
  slaPausedAt: string | null;
  slaResumedAt: string | null;
  slaConsumedSeconds: number | null;
  slaRemainingSeconds: number | null;
  slaDeadlineAt: string | null;
  slaStatusExtended: WorkOrderCorrectiveSlaStatus | null;
  slaExceededAt: string | null;
  /** Orçamento total em segundos (congelado na OS). */
  correctiveSlaTotalSeconds: number | null;
  /** Janela operacional congelada na OS (campo virtual de resposta). */
  correctiveSlaWindowStart: string | null;
  correctiveSlaWindowEnd: string | null;
  /** SLA negativo (atraso) — calculado em tempo real, não persistido. */
  correctiveSlaOverdueActive: boolean;
  correctiveSlaOverdueSeconds: number;
  correctiveSlaOverdueStatus: CorrectiveSlaOverdueStatus | null;
}

export function isCorrectiveWorkOrderType(
  type: WorkOrderType,
): type is typeof WorkOrderType.CORRECTIVE {
  return type === WorkOrderType.CORRECTIVE;
}
