import { WorkOrderType } from '@prisma/client';
import { formatarTituloLocalidadeKm } from './location-km-title.util';
import type { ReportExportPackageWorkOrderInput } from './report-export-package.types';

const RULE = '═'.repeat(64);
const THIN = '─'.repeat(64);

const TIPO_LABEL: Record<string, string> = {
  [WorkOrderType.CORRECTIVE]: 'Corretiva',
  [WorkOrderType.PREVENTIVE]: 'Preventiva',
  [WorkOrderType.GENERAL]: 'Geral',
};

/**
 * Monta o log de pausas/retornos da OS (layout textual legível).
 * Retorna null quando não há eventos.
 */
export function montarConteudoPausasRetornos(
  order: Pick<
    ReportExportPackageWorkOrderInput,
    'sequentialNumber' | 'type' | 'locationCode' | 'locationKm' | 'pauseEvents'
  >,
): string | null {
  const events = [...(order.pauseEvents ?? [])].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  if (events.length === 0) return null;
  const osTitle = montarTituloOs(order);
  const lines: string[] = [
    RULE,
    '  HISTÓRICO DE PAUSAS E RETORNOS',
    `  ${osTitle}`,
    RULE,
    '',
  ];
  let ciclo = 0;
  let i = 0;
  let totalPausedSeconds = 0;
  let pauseCount = 0;
  let returnCount = 0;
  let openPauseAt: Date | null = null;
  while (i < events.length) {
    const event = events[i];
    if (event.eventType === 'PAUSE') {
      pauseCount += 1;
      ciclo += 1;
      const resumeIndex = events.findIndex(
        (item, idx) => idx > i && item.eventType === 'RESUME',
      );
      const resume = resumeIndex >= 0 ? events[resumeIndex] : null;
      lines.push(separadorCiclo(ciclo));
      lines.push('  ● PAUSA');
      lines.push(`  Data/hora .... ${formatarDataHoraBr(event.createdAt)}`);
      lines.push(`  Responsável .. ${event.authorName?.trim() || '—'}`);
      lines.push('  Motivo');
      for (const part of quebrarTexto(event.reason)) {
        lines.push(`    ${part}`);
      }
      lines.push('');
      if (resume) {
        returnCount += 1;
        const durationSec = segundosEntre(event.createdAt, resume.createdAt);
        totalPausedSeconds += durationSec;
        lines.push('  ● RETORNO');
        lines.push(`  Data/hora .... ${formatarDataHoraBr(resume.createdAt)}`);
        lines.push(`  Responsável .. ${resume.authorName?.trim() || '—'}`);
        lines.push('  Motivo do retorno');
        for (const part of quebrarTexto(resume.reason)) {
          lines.push(`    ${part}`);
        }
        lines.push(`  Tempo pausado  ${formatarDuracao(durationSec)}`);
        lines.push('');
        i = resumeIndex + 1;
        continue;
      }
      openPauseAt = event.createdAt;
      lines.push('  ○ RETORNO');
      lines.push('  Status ....... Em andamento (pausa aberta)');
      lines.push(
        `  Tempo parcial  ${formatarDuracao(segundosEntre(event.createdAt, new Date()))}`,
      );
      lines.push('');
      i += 1;
      continue;
    }
    returnCount += 1;
    ciclo += 1;
    lines.push(separadorCiclo(ciclo));
    lines.push('  ● RETORNO (sem pausa anterior registrada)');
    lines.push(`  Data/hora .... ${formatarDataHoraBr(event.createdAt)}`);
    lines.push(`  Responsável .. ${event.authorName?.trim() || '—'}`);
    lines.push('  Motivo do retorno');
    for (const part of quebrarTexto(event.reason)) {
      lines.push(`    ${part}`);
    }
    lines.push('');
    i += 1;
  }
  lines.push(THIN);
  lines.push('  RESUMO');
  lines.push(`  Pausas .............. ${pauseCount}`);
  lines.push(`  Retornos ............ ${returnCount}`);
  lines.push(`  Tempo total pausado . ${formatarDuracao(totalPausedSeconds)}`);
  if (openPauseAt) {
    lines.push(
      `  (+ pausa aberta desde ${formatarDataHoraBr(openPauseAt)})`,
    );
  }
  lines.push(RULE);
  lines.push('');
  return comBom(lines);
}

/**
 * Monta o log de comentários da OS.
 * Retorna null quando não há comentários.
 */
export function montarConteudoComentarios(
  order: Pick<
    ReportExportPackageWorkOrderInput,
    'sequentialNumber' | 'type' | 'locationCode' | 'locationKm' | 'comments'
  >,
): string | null {
  const comments = [...(order.comments ?? [])].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  if (comments.length === 0) return null;
  const osTitle = montarTituloOs(order);
  const lines: string[] = [
    RULE,
    '  COMENTÁRIOS DA ORDEM DE SERVIÇO',
    `  ${osTitle}`,
    RULE,
    '',
  ];
  comments.forEach((comment, index) => {
    const n = String(index + 1).padStart(2, '0');
    lines.push(`[${n}]  ${formatarDataHoraBr(comment.createdAt)}`);
    lines.push(`     Autor ..... ${comment.authorName?.trim() || '—'}`);
    lines.push(`     ${'─'.repeat(48)}`);
    const body = String(comment.text ?? '').trim() || '(sem conteúdo)';
    for (const part of body.split(/\r?\n/)) {
      lines.push(`     ${part.trimEnd()}`);
    }
    lines.push('');
  });
  lines.push(THIN);
  lines.push(`  Total de comentários: ${comments.length}`);
  lines.push(RULE);
  lines.push('');
  return comBom(lines);
}

function montarTituloOs(
  order: Pick<
    ReportExportPackageWorkOrderInput,
    'sequentialNumber' | 'type' | 'locationCode' | 'locationKm'
  >,
): string {
  const codigo =
    String(order.sequentialNumber ?? '').trim() || 'OS-sem-numero';
  const localidade = formatarTituloLocalidadeKm({
    code: order.locationCode,
    km: order.locationKm,
  });
  const tipo = TIPO_LABEL[order.type] || order.type || 'OS';
  return `${codigo} • ${localidade} • ${tipo}`;
}

function separadorCiclo(ciclo: number): string {
  const label = `── Ciclo ${ciclo} `;
  return `${label}${THIN.slice(label.length)}`;
}

function formatarDataHoraBr(value: Date): string {
  return value.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatarDuracao(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds === 0) return '00min 00s';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${String(days).padStart(2, '0')}d`);
  if (days > 0 || hours > 0) parts.push(`${String(hours).padStart(2, '0')}h`);
  parts.push(`${String(minutes).padStart(2, '0')}min`);
  parts.push(`${String(secs).padStart(2, '0')}s`);
  return parts.join(' ');
}

function segundosEntre(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

function quebrarTexto(value?: string | null): string[] {
  const text = String(value ?? '').trim() || '—';
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function comBom(lines: string[]): string {
  return `\uFEFF${lines.join('\r\n')}`;
}
