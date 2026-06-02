import { WorkOrderCorrectiveSlaStatus, WorkOrderType } from '@prisma/client';

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
  /** Orçamento total em segundos (configuração da empresa no momento da leitura). */
  correctiveSlaTotalSeconds: number | null;
}

export function isCorrectiveWorkOrderType(
  type: WorkOrderType,
): type is typeof WorkOrderType.CORRECTIVE {
  return type === WorkOrderType.CORRECTIVE;
}
