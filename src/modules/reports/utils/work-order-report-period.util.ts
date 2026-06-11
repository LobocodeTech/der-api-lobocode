import { BadRequestException } from '@nestjs/common';
import { ReportPeriod } from '../dto/work-order-report-filter.dto';

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

function inicioDoDiaBrt(base: Date): Date {
  const brt = new Date(base.getTime() - BRT_OFFSET_MS);
  const y = brt.getUTCFullYear();
  const mo = brt.getUTCMonth();
  const d = brt.getUTCDate();
  return new Date(Date.UTC(y, mo, d, 3, 0, 0, 0));
}

function fimDoDiaBrt(base: Date): Date {
  const inicio = inicioDoDiaBrt(base);
  return new Date(inicio.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function resolverIntervaloPeriodoRelatorio(
  period: ReportPeriod = 'last-30-days',
  dateFrom?: string,
  dateTo?: string,
): { start: Date; end: Date } {
  const agora = new Date();
  const end = fimDoDiaBrt(agora);

  if (period === 'custom') {
    if (!dateFrom || !dateTo) {
      throw new BadRequestException(
        'Para período personalizado, informe dateFrom e dateTo.',
      );
    }
    const start = inicioDoDiaBrt(new Date(dateFrom));
    const customEnd = fimDoDiaBrt(new Date(dateTo));
    if (start.getTime() > customEnd.getTime()) {
      throw new BadRequestException('dateFrom não pode ser posterior a dateTo.');
    }
    return { start, end: customEnd };
  }

  if (period === 'today') {
    return { start: inicioDoDiaBrt(agora), end };
  }

  if (period === 'yesterday') {
    const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    return { start: inicioDoDiaBrt(ontem), end: fimDoDiaBrt(ontem) };
  }

  if (period === 'last-7-days') {
    const start = inicioDoDiaBrt(new Date(agora.getTime() - 6 * 24 * 60 * 60 * 1000));
    return { start, end };
  }

  if (period === 'last-15-days') {
    const start = inicioDoDiaBrt(new Date(agora.getTime() - 14 * 24 * 60 * 60 * 1000));
    return { start, end };
  }

  if (period === 'last-30-days') {
    const start = inicioDoDiaBrt(new Date(agora.getTime() - 29 * 24 * 60 * 60 * 1000));
    return { start, end };
  }

  if (period === 'current-month') {
    const brt = new Date(agora.getTime() - BRT_OFFSET_MS);
    const y = brt.getUTCFullYear();
    const mo = brt.getUTCMonth();
    return {
      start: new Date(Date.UTC(y, mo, 1, 3, 0, 0, 0)),
      end,
    };
  }

  if (period === 'previous-month') {
    const brt = new Date(agora.getTime() - BRT_OFFSET_MS);
    const y = brt.getUTCFullYear();
    const mo = brt.getUTCMonth();
    const start = new Date(Date.UTC(y, mo - 1, 1, 3, 0, 0, 0));
    const endPrev = new Date(Date.UTC(y, mo, 1, 3, 0, 0, 0) - 1);
    return { start, end: endPrev };
  }

  const start = inicioDoDiaBrt(new Date(agora.getTime() - 29 * 24 * 60 * 60 * 1000));
  return { start, end };
}
