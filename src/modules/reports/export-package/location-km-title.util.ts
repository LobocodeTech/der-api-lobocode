/**
 * Formato de localidade alinhado ao front (`location-km-title.ts`):
 * `código KM 065+000` (pad 3 dígitos se code numérico).
 */
export function formatarTituloLocalidadeKm(parts: {
  code?: string | null;
  km?: string | null;
}): string {
  const codeRaw = String(parts.code ?? '').trim();
  const codePart =
    codeRaw === ''
      ? '—'
      : /^\d+$/.test(codeRaw)
        ? codeRaw.padStart(3, '0')
        : codeRaw;
  const kmPart = String(parts.km ?? '').trim() || '—';
  return `${codePart} KM ${kmPart}`;
}
