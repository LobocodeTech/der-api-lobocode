import { WorkOrderSlaStatus, WorkOrderStatus } from '@prisma/client';
import { instanteFimDoPrazoAPartirDoCampoDate } from './work-order-due-date.util';

/** Dias antes do vencimento para exibir alerta (laranja). */
export const WARNING_DAYS_BEFORE_DUE = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function ymdFromCampoDate(dueDate: Date): string {
  const y = dueDate.getUTCFullYear();
  const mo = dueDate.getUTCMonth() + 1;
  const d = dueDate.getUTCDate();
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function ymdAgoraCivilBrt(agora: Date): string {
  const brt = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const y = brt.getUTCFullYear();
  const mo = brt.getUTCMonth() + 1;
  const d = brt.getUTCDate();
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function diffDiasCivisYmd(inicioYmd: string, fimYmd: string): number {
  const parse = (ymd: string) => {
    const y = Number(ymd.slice(0, 4));
    const mo = Number(ymd.slice(5, 7));
    const d = Number(ymd.slice(8, 10));
    return Date.UTC(y, mo - 1, d);
  };
  return Math.round((parse(fimYmd) - parse(inicioYmd)) / MS_PER_DAY);
}

/** Dias civis entre hoje (BRT) e o dia do prazo — alinhado ao total exibido no banner. */
export function diasRestantesCivisAtePrazo(
  dueDate: Date,
  agora: Date = new Date(),
): number {
  return Math.max(0, diffDiasCivisYmd(ymdAgoraCivilBrt(agora), ymdFromCampoDate(dueDate)));
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

  const diasRestantes = diasRestantesCivisAtePrazo(dueDate, agora);
  if (diasRestantes <= WARNING_DAYS_BEFORE_DUE) {
    return WorkOrderSlaStatus.WARNING;
  }

  return WorkOrderSlaStatus.OK;
}
