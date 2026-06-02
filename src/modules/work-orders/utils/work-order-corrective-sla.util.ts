import { BadRequestException } from '@nestjs/common';

/** BRT fixo (UTC−3), alinhado a `work-order-due-date.util.ts`. */
const BRT_OFFSET_HOURS = 3;

export const DEFAULT_CORRECTIVE_SLA_SECONDS = 6 * 60 * 60;
export const DEFAULT_WINDOW_START = '06:00';
export const DEFAULT_WINDOW_END = '18:00';
export const NEAR_BREACH_RATIO = 0.8;
export const ONE_HOUR_USEFUL_SECONDS = 3600;

export interface CorrectiveSlaCompanyConfig {
  correctiveSlaDefaultSeconds: number;
  correctiveSlaWindowStart: string;
  correctiveSlaWindowEnd: string;
}

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

export function normalizarConfigSlaEmpresa(
  config: Partial<CorrectiveSlaCompanyConfig> | null | undefined,
): CorrectiveSlaCompanyConfig {
  const seconds =
    config?.correctiveSlaDefaultSeconds ?? DEFAULT_CORRECTIVE_SLA_SECONDS;
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
  if (seconds < 1800) {
    throw new BadRequestException(
      'O SLA padrão deve ser de pelo menos 30 minutos.',
    );
  }
  return {
    correctiveSlaDefaultSeconds: seconds,
    correctiveSlaWindowStart: windowStart,
    correctiveSlaWindowEnd: windowEnd,
  };
}
