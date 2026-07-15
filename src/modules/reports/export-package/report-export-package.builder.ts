import { WorkOrderType } from '@prisma/client';
import { formatarTituloLocalidadeKm } from './location-km-title.util';
import {
  montarConteudoComentarios,
  montarConteudoPausasRetornos,
} from './report-export-package-logs.util';
import type {
  ReportExportPackageBuildResult,
  ReportExportPackageFile,
  ReportExportPackageOsReportInput,
  ReportExportPackageTypeReportInput,
  ReportExportPackageWorkOrderInput,
  ReportExportTypeFolder,
} from './report-export-package.types';

const PASTA_POR_TIPO: Record<string, ReportExportTypeFolder> = {
  [WorkOrderType.CORRECTIVE]: 'Corretiva',
  [WorkOrderType.PREVENTIVE]: 'Preventiva',
  [WorkOrderType.GENERAL]: 'Geral',
};

const CHECKLIST_PREFIX = '- ';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Estrutura:
 *   Corretiva/
 *     Relatorio OS Corretiva • Mensal.xlsx
 *     OS-1 • 212 KM 212+121 • Corretiva/
 *       OS-1 • 212 KM 212+121 • Corretiva.xlsx
 *       checklist.txt
 *       pausas-retornos.txt   (se houver)
 *       comentarios.txt       (se houver)
 *       evidencias...
 *   Preventiva/
 *   Geral/
 */
export function construirPacoteExportacaoPorTipo(params: {
  workOrders: ReportExportPackageWorkOrderInput[];
  typeReports: ReportExportPackageTypeReportInput[];
  osReports: ReportExportPackageOsReportInput[];
}): ReportExportPackageBuildResult {
  const files: ReportExportPackageFile[] = [];
  const workOrderFolderNames: string[] = [];
  const usedFolderNamesByType = new Map<string, Set<string>>();
  for (const report of params.typeReports) {
    if (!report.buffer?.length) continue;
    const typeFolder = sanitizarSegmentoPath(report.typeFolder);
    const fileName = sanitizarSegmentoPath(
      report.fileName || `Relatorio OS ${typeFolder}.xlsx`,
    );
    files.push({
      relativePath: `${typeFolder}/${fileName}`,
      buffer: report.buffer,
      contentType: report.contentType || XLSX_MIME,
    });
  }
  const osReportByWorkOrderId = new Map(
    params.osReports.map((report) => [report.workOrderId, report]),
  );
  for (const order of params.workOrders) {
    const typeFolder = resolverPastaTipo(order.type);
    const used = usedFolderNamesByType.get(typeFolder) ?? new Set<string>();
    usedFolderNamesByType.set(typeFolder, used);
    const osReport = osReportByWorkOrderId.get(order.id);
    let folderName = osReport?.folderName?.trim()
      ? sanitizarSegmentoPath(osReport.folderName)
      : montarNomePastaOrdem(order);
    folderName = garantirNomeUnico(folderName, used);
    used.add(folderName.toLowerCase());
    workOrderFolderNames.push(`${typeFolder}/${folderName}`);
    const osPath = `${typeFolder}/${folderName}`;
    if (order.checklistItems.length > 0) {
      files.push({
        relativePath: `${osPath}/checklist.txt`,
        buffer: Buffer.from(
          montarConteudoChecklist(order.checklistItems),
          'utf8',
        ),
        contentType: 'text/plain; charset=utf-8',
      });
    }
    const pausasTxt = montarConteudoPausasRetornos(order);
    if (pausasTxt) {
      files.push({
        relativePath: `${osPath}/pausas-retornos.txt`,
        buffer: Buffer.from(pausasTxt, 'utf8'),
        contentType: 'text/plain; charset=utf-8',
      });
    }
    const comentariosTxt = montarConteudoComentarios(order);
    if (comentariosTxt) {
      files.push({
        relativePath: `${osPath}/comentarios.txt`,
        buffer: Buffer.from(comentariosTxt, 'utf8'),
        contentType: 'text/plain; charset=utf-8',
      });
    }
    if (osReport?.buffer?.length) {
      // Sempre o mesmo nome da pasta (inclui sufixo de unicidade, se houver).
      const osFileName = sanitizarSegmentoPath(`${folderName}.xlsx`);
      files.push({
        relativePath: `${osPath}/${osFileName}`,
        buffer: osReport.buffer,
        contentType: osReport.contentType || XLSX_MIME,
      });
    }
    const usedEvidenceNames = new Set<string>();
    for (const evidence of order.evidences) {
      if (!evidence.buffer?.length) continue;
      const baseName = sanitizarSegmentoPath(
        evidence.originalName || 'evidencia.bin',
      );
      const uniqueName = garantirNomeUnico(baseName, usedEvidenceNames);
      usedEvidenceNames.add(uniqueName.toLowerCase());
      files.push({
        relativePath: `${osPath}/${uniqueName}`,
        buffer: evidence.buffer,
        contentType: evidence.mimeType || 'application/octet-stream',
      });
    }
  }
  return { packageFolderName: '', files, workOrderFolderNames };
}

export function resolverPastaTipo(type: string): ReportExportTypeFolder {
  return PASTA_POR_TIPO[type] || 'Geral';
}

/**
 * Ex.: `OS-1 • 212 KM 212+121 • Preventiva`
 */
export function montarNomePastaOrdem(
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
  const tipo = PASTA_POR_TIPO[order.type] || order.type || 'OS';
  return sanitizarSegmentoPath(`${codigo} • ${localidade} • ${tipo}`);
}

export function montarConteudoChecklist(
  items: ReportExportPackageWorkOrderInput['checklistItems'],
): string {
  const ordered = [...items].sort((a, b) => {
    const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.label.localeCompare(b.label, 'pt-BR');
  });
  const lines: string[] = [];
  if (ordered.length === 0) {
    lines.push(`${CHECKLIST_PREFIX}Nenhum item no checklist.`);
  } else {
    for (const item of ordered) {
      const label = String(item.label ?? '').trim() || 'Item sem título';
      const parts = label
        .split(/\r?\n/)
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length === 0) {
        lines.push(`${CHECKLIST_PREFIX}Item sem título`);
        continue;
      }
      for (const part of parts) {
        lines.push(`${CHECKLIST_PREFIX}${part}`);
      }
    }
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function sanitizarSegmentoPath(value: string): string {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/\.+$/g, '')
      .slice(0, 180) || 'item'
  );
}

function garantirNomeUnico(name: string, used: Set<string>): string {
  const lower = name.toLowerCase();
  if (!used.has(lower)) {
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let index = 2;
  while (used.has(`${stem} (${index})${ext}`.toLowerCase())) {
    index += 1;
  }
  return `${stem} (${index})${ext}`;
}
