import { BadRequestException } from '@nestjs/common';

/** Prazo da OS: somente dia civil (AAAA-MM-DD), sem horário. */
export const WORK_ORDER_DUE_DATE_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Aceita AAAA-MM-DD ou ISO legado com horário; devolve AAAA-MM-DD ou undefined.
 */
export function extrairDiaCivilDoPrazo(
  value: string | null | undefined,
): string | undefined {
  if (value == null || typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (WORK_ORDER_DUE_DATE_DAY_RE.test(trimmed)) return trimmed;
  if (trimmed.length >= 10 && WORK_ORDER_DUE_DATE_DAY_RE.test(trimmed.slice(0, 10))) {
    return trimmed.slice(0, 10);
  }
  throw new BadRequestException(
    'Prazo inválido. Informe apenas a data no formato AAAA-MM-DD.',
  );
}

/** Instante do fim do dia civil no fuso America/Sao_Paulo (UTC−3, sem horário de verão). */
export function instanteFimDoPrazoParaSla(diaCivilYmd: string): Date {
  const m = WORK_ORDER_DUE_DATE_DAY_RE.exec(diaCivilYmd.trim());
  if (!m) {
    throw new BadRequestException(
      'Prazo inválido. Informe apenas a data no formato AAAA-MM-DD.',
    );
  }
  const y = Number(m[0].slice(0, 4));
  const mo = Number(m[0].slice(5, 7));
  const d = Number(m[0].slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    throw new BadRequestException('Prazo inválido.');
  }
  // 23:59:59.999 em BRT = +3h em relação ao UTC do mesmo dia civil
  return new Date(Date.UTC(y, mo - 1, d, 23 + 3, 59, 59, 999));
}

/** Valor gravado em coluna DATE (meia-noite UTC do dia civil). */
export function diaCivilParaDatePostgres(diaCivilYmd: string): Date {
  const m = WORK_ORDER_DUE_DATE_DAY_RE.exec(diaCivilYmd.trim());
  if (!m) {
    throw new BadRequestException(
      'Prazo inválido. Informe apenas a data no formato AAAA-MM-DD.',
    );
  }
  const y = Number(m[0].slice(0, 4));
  const mo = Number(m[0].slice(5, 7));
  const d = Number(m[0].slice(8, 10));
  return new Date(Date.UTC(y, mo - 1, d));
}

/** A partir do Date devolvido pelo Prisma para @db.Date (meia-noite UTC do dia). */
export function instanteFimDoPrazoAPartirDoCampoDate(
  dueDate: Date | null | undefined,
): Date | null {
  if (!dueDate) return null;
  const y = dueDate.getUTCFullYear();
  const mo = dueDate.getUTCMonth() + 1;
  const d = dueDate.getUTCDate();
  const ymd = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return instanteFimDoPrazoParaSla(ymd);
}

export function horasRestantesAteFimDoPrazo(
  dueDate: Date | null | undefined,
): number | null {
  const fim = instanteFimDoPrazoAPartirDoCampoDate(dueDate);
  if (!fim) return null;
  return Math.ceil((fim.getTime() - Date.now()) / (1000 * 60 * 60));
}
