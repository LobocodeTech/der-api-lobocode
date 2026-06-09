import { BadRequestException } from '@nestjs/common';

/** BRT fixo (UTC−3), alinhado a `work-order-due-date.util.ts`. */
const BRT_OFFSET_HOURS = 3;

export const DEFAULT_CORRECTIVE_SLA_SECONDS = 6 * 60 * 60;
/** Mínimo aceito ao salvar SLA padrão da empresa (Configurações). */
export const MIN_CORRECTIVE_SLA_SECONDS = 30 * 60;
export const DEFAULT_WINDOW_START = '06:00';
export const DEFAULT_WINDOW_END = '18:00';
export const NEAR_BREACH_RATIO = 0.8;
export const ONE_HOUR_USEFUL_SECONDS = 3600;

export interface CorrectiveSlaCompanyConfig {
  correctiveSlaDefaultSeconds: number;
  correctiveSlaWindowStart: string;
  correctiveSlaWindowEnd: string;
}

/** Snapshot de SLA persistido na OS (sem novas colunas). */
export interface CorrectiveSlaOrderSnapshot {
  slaDeadlineHours?: number | null;
  slaStartAt?: Date | null;
  slaDeadlineAt?: Date | null;
  slaConsumedSeconds?: number | null;
  slaRemainingSeconds?: number | null;
  slaExceededAt?: Date | null;
  slaStatusExtended?: string | null;
}

const WINDOW_PACK_MULTIPLIER = 10000;

export interface BrtDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function parseWindowTime(value: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) {
    throw new BadRequestException(
      'Horário de janela operacional inválido. Use HH:mm.',
    );
  }
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new BadRequestException('Horário de janela operacional inválido.');
  }
  return { hour, minute };
}

export function toBrtParts(date: Date): BrtDateParts {
  const shifted = new Date(date.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

/** Instante UTC correspondente a um horário civil em BRT. */
export function fromBrt(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
  ms = 0,
): Date {
  return new Date(
    Date.UTC(year, month, day, hour + BRT_OFFSET_HOURS, minute, second, ms),
  );
}

export function startOfBrtDay(date: Date): Date {
  const p = toBrtParts(date);
  return fromBrt(p.year, p.month, p.day, 0, 0, 0, 0);
}

export function addBrtDays(date: Date, days: number): Date {
  const p = toBrtParts(date);
  return fromBrt(p.year, p.month, p.day + days, 0, 0, 0, 0);
}

export function isWithinOperationalWindow(
  date: Date,
  windowStart: string,
  windowEnd: string,
): boolean {
  const p = toBrtParts(date);
  const start = parseWindowTime(windowStart);
  const end = parseWindowTime(windowEnd);
  const minutes = p.hour * 60 + p.minute;
  const startMin = start.hour * 60 + start.minute;
  const endMin = end.hour * 60 + end.minute;
  return minutes >= startMin && minutes < endMin;
}

/**
 * Define quando o SLA corretivo começa a contar.
 * - Entre windowStart e windowEnd: imediato.
 * - Antes de windowStart no mesmo dia: às windowStart do mesmo dia.
 * - Após windowEnd: windowStart do dia seguinte.
 */
export function calcularInicioEfetivoSla(
  createdAt: Date,
  windowStart: string,
  windowEnd: string,
): Date {
  const p = toBrtParts(createdAt);
  const start = parseWindowTime(windowStart);
  const end = parseWindowTime(windowEnd);
  const minutes = p.hour * 60 + p.minute;
  const startMin = start.hour * 60 + start.minute;
  const endMin = end.hour * 60 + end.minute;

  if (minutes >= startMin && minutes < endMin) {
    return createdAt;
  }
  if (minutes < startMin) {
    return fromBrt(p.year, p.month, p.day, start.hour, start.minute, 0, 0);
  }
  return fromBrt(p.year, p.month, p.day + 1, start.hour, start.minute, 0, 0);
}

/** Segundos de tempo útil entre dois instantes (janela diária, inclusive fins de semana). */
export function calcularSegundosUteis(
  inicio: Date,
  fim: Date,
  windowStart: string,
  windowEnd: string,
): number {
  if (fim.getTime() <= inicio.getTime()) {
    return 0;
  }

  const start = parseWindowTime(windowStart);
  const end = parseWindowTime(windowEnd);
  let total = 0;
  let dayCursor = startOfBrtDay(inicio);

  while (dayCursor.getTime() < fim.getTime()) {
    const p = toBrtParts(dayCursor);
    const windowOpen = fromBrt(p.year, p.month, p.day, start.hour, start.minute);
    const windowClose = fromBrt(p.year, p.month, p.day, end.hour, end.minute);
    const segStart = Math.max(inicio.getTime(), windowOpen.getTime());
    const segEnd = Math.min(fim.getTime(), windowClose.getTime());
    if (segEnd > segStart) {
      total += Math.floor((segEnd - segStart) / 1000);
    }
    dayCursor = addBrtDays(dayCursor, 1);
  }

  return total;
}

/** Projeta o instante em que o SLA útil se esgota. */
export function calcularDeadlineSla(
  slaStartAt: Date,
  budgetSeconds: number,
  windowStart: string,
  windowEnd: string,
): Date {
  if (budgetSeconds <= 0) {
    return slaStartAt;
  }

  let remaining = budgetSeconds;
  let cursor = slaStartAt;
  const maxDays = 365 * 5;
  let days = 0;

  while (remaining > 0 && days < maxDays) {
    const p = toBrtParts(cursor);
    const start = parseWindowTime(windowStart);
    const end = parseWindowTime(windowEnd);
    const windowOpen = fromBrt(p.year, p.month, p.day, start.hour, start.minute);
    const windowClose = fromBrt(p.year, p.month, p.day, end.hour, end.minute);

    const effectiveStart = Math.max(cursor.getTime(), windowOpen.getTime());
    if (effectiveStart >= windowClose.getTime()) {
      cursor = addBrtDays(startOfBrtDay(cursor), 1);
      cursor = fromBrt(
        toBrtParts(cursor).year,
        toBrtParts(cursor).month,
        toBrtParts(cursor).day,
        start.hour,
        start.minute,
      );
      days += 1;
      continue;
    }

    const available = Math.floor((windowClose.getTime() - effectiveStart) / 1000);
    if (remaining <= available) {
      return new Date(effectiveStart + remaining * 1000);
    }

    remaining -= available;
    const nextDay = addBrtDays(startOfBrtDay(cursor), 1);
    cursor = fromBrt(
      toBrtParts(nextDay).year,
      toBrtParts(nextDay).month,
      toBrtParts(nextDay).day,
      start.hour,
      start.minute,
    );
    days += 1;
  }

  return cursor;
}

function windowTimeToMinutes(value: string): number {
  const { hour, minute } = parseWindowTime(value);
  return hour * 60 + minute;
}

function minutesToWindowTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Em OS corretivas, `slaDeadlineHours` armazena a janela operacional empacotada:
 * startMinutes * 10000 + endMinutes (minutos desde meia-noite, BRT).
 */
export function empacotarJanelaSla(
  windowStart: string,
  windowEnd: string,
): number {
  const startMinutes = windowTimeToMinutes(windowStart);
  const endMinutes = windowTimeToMinutes(windowEnd);
  return startMinutes * WINDOW_PACK_MULTIPLIER + endMinutes;
}

export function desempacotarJanelaSla(packed: number | null | undefined): {
  windowStart: string;
  windowEnd: string;
} | null {
  if (packed == null || !Number.isFinite(packed) || packed <= 0) {
    return null;
  }
  const startMinutes = Math.floor(packed / WINDOW_PACK_MULTIPLIER);
  const endMinutes = packed % WINDOW_PACK_MULTIPLIER;
  if (
    startMinutes < 0 ||
    startMinutes >= 24 * 60 ||
    endMinutes <= 0 ||
    endMinutes >= 24 * 60 ||
    startMinutes >= endMinutes
  ) {
    return null;
  }
  return {
    windowStart: minutesToWindowTime(startMinutes),
    windowEnd: minutesToWindowTime(endMinutes),
  };
}

function ordemSlaEstaVencida(
  ordem: Pick<
    CorrectiveSlaOrderSnapshot,
    'slaConsumedSeconds' | 'slaRemainingSeconds' | 'slaExceededAt' | 'slaStatusExtended'
  >,
  fallbackSeconds: number,
): boolean {
  const consumed = Math.max(0, ordem.slaConsumedSeconds ?? 0);
  if (ordem.slaExceededAt) {
    return true;
  }
  if (
    ordem.slaStatusExtended === 'BREACHED' ||
    ordem.slaStatusExtended === 'COMPLETED_LATE'
  ) {
    return true;
  }
  return consumed >= fallbackSeconds;
}

export function derivarBudgetSegundosDaOrdem(
  ordem: Pick<
    CorrectiveSlaOrderSnapshot,
    | 'slaConsumedSeconds'
    | 'slaRemainingSeconds'
    | 'slaExceededAt'
    | 'slaStatusExtended'
    | 'slaStartAt'
    | 'slaDeadlineAt'
  >,
  fallbackSeconds: number,
): number {
  const consumed = Math.max(0, ordem.slaConsumedSeconds ?? 0);
  const remaining = ordem.slaRemainingSeconds;

  if (remaining != null && remaining > 0) {
    if (consumed === 0 && remaining < fallbackSeconds) {
      return fallbackSeconds;
    }
    return consumed + remaining;
  }

  if (remaining === 0 && consumed > 0) {
    if (ordemSlaEstaVencida(ordem, fallbackSeconds)) {
      return fallbackSeconds;
    }
    if (consumed < fallbackSeconds) {
      return fallbackSeconds;
    }
    return consumed;
  }

  return fallbackSeconds;
}

/** Candidatos para inferir janela em OS legadas sem pacote. */
function gerarCandidatosJanelaSla(
  companyConfig: CorrectiveSlaCompanyConfig,
): Array<{ windowStart: string; windowEnd: string }> {
  const empresa = normalizarConfigSlaEmpresa(companyConfig);
  const padrao = normalizarConfigSlaEmpresa({});
  const candidatos = [
    {
      windowStart: padrao.correctiveSlaWindowStart,
      windowEnd: padrao.correctiveSlaWindowEnd,
    },
    {
      windowStart: empresa.correctiveSlaWindowStart,
      windowEnd: empresa.correctiveSlaWindowEnd,
    },
  ];
  const vistos = new Set<string>();
  return candidatos.filter((c) => {
    const key = `${c.windowStart}|${c.windowEnd}`;
    if (vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
}

export function inferirJanelaSlaPorPrazo(params: {
  slaStartAt: Date;
  slaDeadlineAt: Date;
  budgetSeconds: number;
  companyConfig: CorrectiveSlaCompanyConfig;
}): { windowStart: string; windowEnd: string } | null {
  const { slaStartAt, slaDeadlineAt, budgetSeconds, companyConfig } = params;
  if (budgetSeconds <= 0) {
    return null;
  }
  for (const candidato of gerarCandidatosJanelaSla(companyConfig)) {
    const projetado = calcularDeadlineSla(
      slaStartAt,
      budgetSeconds,
      candidato.windowStart,
      candidato.windowEnd,
    );
    if (projetado.getTime() === slaDeadlineAt.getTime()) {
      return candidato;
    }
  }
  return null;
}

/** Resolve config efetiva da OS (congelada), com fallback para empresa/OS legada. */
export function resolverConfigSlaDaOrdem(
  ordem: CorrectiveSlaOrderSnapshot,
  companyConfig: CorrectiveSlaCompanyConfig,
): CorrectiveSlaCompanyConfig {
  const empresa = normalizarConfigSlaEmpresa(companyConfig);
  const budget = derivarBudgetSegundosDaOrdem(ordem, empresa.correctiveSlaDefaultSeconds);

  const empacotado = desempacotarJanelaSla(ordem.slaDeadlineHours);
  if (empacotado) {
    return normalizarConfigSlaEmpresa({
      correctiveSlaDefaultSeconds: budget,
      correctiveSlaWindowStart: empacotado.windowStart,
      correctiveSlaWindowEnd: empacotado.windowEnd,
    });
  }

  if (ordem.slaStartAt && ordem.slaDeadlineAt && budget > 0) {
    const inferida = inferirJanelaSlaPorPrazo({
      slaStartAt: ordem.slaStartAt,
      slaDeadlineAt: ordem.slaDeadlineAt,
      budgetSeconds: budget,
      companyConfig: empresa,
    });
    if (inferida) {
      return normalizarConfigSlaEmpresa({
        correctiveSlaDefaultSeconds: budget,
        correctiveSlaWindowStart: inferida.windowStart,
        correctiveSlaWindowEnd: inferida.windowEnd,
      });
    }
  }

  return normalizarConfigSlaEmpresa({
    correctiveSlaDefaultSeconds: budget,
    correctiveSlaWindowStart: empresa.correctiveSlaWindowStart,
    correctiveSlaWindowEnd: empresa.correctiveSlaWindowEnd,
  });
}

export function normalizarConfigSlaEmpresa(
  config: Partial<CorrectiveSlaCompanyConfig> | null | undefined,
): CorrectiveSlaCompanyConfig {
  let seconds =
    config?.correctiveSlaDefaultSeconds ?? DEFAULT_CORRECTIVE_SLA_SECONDS;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    seconds = DEFAULT_CORRECTIVE_SLA_SECONDS;
  }
  const windowStart =
    config?.correctiveSlaWindowStart?.trim() || DEFAULT_WINDOW_START;
  const windowEnd = config?.correctiveSlaWindowEnd?.trim() || DEFAULT_WINDOW_END;
  parseWindowTime(windowStart);
  parseWindowTime(windowEnd);
  const start = parseWindowTime(windowStart);
  const end = parseWindowTime(windowEnd);
  if (start.hour * 60 + start.minute >= end.hour * 60 + end.minute) {
    throw new BadRequestException(
      'O horário de início da janela deve ser anterior ao de encerramento.',
    );
  }
  return {
    correctiveSlaDefaultSeconds: seconds,
    correctiveSlaWindowStart: windowStart,
    correctiveSlaWindowEnd: windowEnd,
  };
}
