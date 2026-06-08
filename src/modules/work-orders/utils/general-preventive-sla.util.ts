import { WorkOrderSlaStatus, WorkOrderStatus } from '@prisma/client';
import { instanteFimDoPrazoAPartirDoCampoDate } from './work-order-due-date.util';

/** Dias antes do vencimento para exibir alerta (laranja). */
export const WARNING_DAYS_BEFORE_DUE = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function diasRestantesAteFimDoPrazo(
  dueDate: Date,
  agora: Date = new Date(),
): number | null {
  const fim = instanteFimDoPrazoAPartirDoCampoDate(dueDate);
  if (!fim) return null;
  const diffMs = fim.getTime() - agora.getTime();
  if (diffMs < 0) return 0;
  return Math.ceil(diffMs / MS_PER_DAY);
}

export function calcularSlaStatusGeralPreventiva(
  dueDate: Date | null | undefined,
  status: WorkOrderStatus,
  agora: Date = new Date(),
  completedAt?: Date | null,
): WorkOrderSlaStatus {
  if (!dueDate) {
    return WorkOrderSlaStatus.OK;
  }

  if (status === WorkOrderStatus.CANCELLED) {
    return WorkOrderSlaStatus.OK;
  }

  const fim = instanteFimDoPrazoAPartirDoCampoDate(dueDate);
  if (!fim) {
    return WorkOrderSlaStatus.OK;
  }

  if (status === WorkOrderStatus.COMPLETED) {
    const referencia = completedAt ?? agora;
    return referencia.getTime() > fim.getTime()
      ? WorkOrderSlaStatus.OVERDUE
      : WorkOrderSlaStatus.OK;
  }

  if (agora.getTime() > fim.getTime()) {
    return WorkOrderSlaStatus.OVERDUE;
  }

  const diasRestantes = diasRestantesAteFimDoPrazo(dueDate, agora);
  if (
    diasRestantes != null &&
    diasRestantes <= WARNING_DAYS_BEFORE_DUE
  ) {
    return WorkOrderSlaStatus.WARNING;
  }

  return WorkOrderSlaStatus.OK;
}
