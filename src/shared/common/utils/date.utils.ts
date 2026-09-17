/**
 * Converte string para Date para persistência (ex.: Prisma).
 * - String vazia/whitespace: retorna default ou new Date().
 * - YYYY-MM-DD: interpreta como UTC meio-dia (evita mudança de dia por timezone).
 * - Outros formatos (ISO completo, etc.): usa new Date(s).
 */
export function parseDateString(
  value: string,
  emptyDefault: Date = new Date(),
): Date {
  const s = (value ?? '').trim();
  if (!s) return emptyDefault;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00.000Z');
  return new Date(s);
}

/**
 * Aplica parseDateString nos campos indicados de um objeto.
 * Só converte quando o valor do campo é string; demais tipos são mantidos.
 * Se nenhum dos dateKeys existir em data, retorna data sem alteração (evita cópia e iteração).
 * Útil para DTOs de criação/atualização com 1, 2 ou n campos de data.
 */
export function withDateFields<T extends object>(
  data: T,
  dateKeys: (keyof T)[],
  emptyDefault?: Date,
): T {
  const hasAnyDateKey = dateKeys.some(
    (k) => (data as Record<string, unknown>)[k as string] !== undefined,
  );
  if (!hasAnyDateKey) return data;

  const out = { ...data } as Record<string, unknown>;
  dateKeys.forEach((k) => {
    const v = out[k as string];
    if (typeof v === 'string') {
      out[k as string] = parseDateString(v, emptyDefault);
    }
  });
  return out as T;
}
