/** Pastas de 1º nível sob `ONEDRIVE_FOLDER_PATH` (ex.: DER). */
export const PASTA_RELATORIOS_OPERACIONAIS = 'Relatórios Operacionais';
export const PASTA_RELATORIOS_ORDENS_SERVICO = 'Relatórios Ordens de Serviço';

export const PASTAS_TIPO_OS = ['Corretiva', 'Preventiva', 'Geral'] as const;

/**
 * Timestamp legível para pastas OneDrive (fuso America/Sao_Paulo).
 * Ex.: `16-07-2026 11h27m33s`
 */
export function formatarTimestampPastaExportacao(
  date: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}h${get('minute')}m${get('second')}s`;
}

/** Ex.: `Relatórios Operacionais/Relatório 16-07-2026 11h27m33s` */
export function montarPastaSessaoRelatorioOperacional(
  exportedAt: Date = new Date(),
): string {
  const ts = formatarTimestampPastaExportacao(exportedAt);
  return `${PASTA_RELATORIOS_OPERACIONAIS}/Relatório ${ts}`;
}

/**
 * Ex.: `Relatórios Ordens de Serviço/OS-1 • 212 KM 212+121 • Corretiva 16-07-2026 09h24m39s`
 */
export function montarPastaSessaoRelatorioOs(
  folderNameBase: string,
  exportedAt: Date = new Date(),
): string {
  const base = folderNameBase.trim() || 'OS';
  const ts = formatarTimestampPastaExportacao(exportedAt);
  return `${PASTA_RELATORIOS_ORDENS_SERVICO}/${base} ${ts}`;
}
