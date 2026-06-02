import { describe, expect, it } from '@jest/globals';
import {
  calcularInicioEfetivoSla,
  calcularSegundosUteis,
  calcularDeadlineSla,
  fromBrt,
  toBrtParts,
} from './work-order-corrective-sla.util';

describe('work-order-corrective-sla.util', () => {
  it('inicia imediatamente dentro da janela', () => {
    const created = fromBrt(2026, 5, 2, 10, 0, 0, 0);
    const start = calcularInicioEfetivoSla(created, '06:00', '18:00');
    expect(start.getTime()).toBe(created.getTime());
  });

  it('inicia no dia seguinte após 18h', () => {
    const created = fromBrt(2026, 5, 2, 19, 30, 0, 0);
    const start = calcularInicioEfetivoSla(created, '06:00', '18:00');
    const p = toBrtParts(start);
    expect(p.day).toBe(3);
    expect(p.hour).toBe(6);
    expect(p.minute).toBe(0);
  });

  it('conta tempo útil apenas na janela', () => {
    const inicio = fromBrt(2026, 5, 2, 10, 0, 0, 0);
    const fim = fromBrt(2026, 5, 2, 12, 0, 0, 0);
    expect(calcularSegundosUteis(inicio, fim, '06:00', '18:00')).toBe(2 * 3600);
  });

  it('projeta deadline com 6h úteis no mesmo dia', () => {
    const slaStart = fromBrt(2026, 5, 2, 8, 0, 0, 0);
    const deadline = calcularDeadlineSla(slaStart, 6 * 3600, '06:00', '18:00');
    const p = toBrtParts(deadline);
    expect(p.hour).toBe(14);
    expect(p.minute).toBe(0);
  });
});
