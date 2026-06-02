import { WorkOrderCorrectiveSlaStatus } from '@prisma/client';

/** Campos de auditoria de SLA corretiva no histórico de pausa/retomada. */
export interface WorkOrderPauseHistorySlaFields {
  effectiveSlaConsumedSeconds: number | null;
  slaStatusExtendedAtEvent: WorkOrderCorrectiveSlaStatus | null;
}
