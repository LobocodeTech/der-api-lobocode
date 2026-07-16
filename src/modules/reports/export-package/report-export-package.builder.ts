import { WorkOrderType } from '@prisma/client';
import { formatarTituloLocalidadeKm } from './location-km-title.util';
import {
  montarPastaSessaoRelatorioOperacional,
  montarPastaSessaoRelatorioOs,
  PASTAS_TIPO_OS,
} from './report-export-onedrive-paths.util';
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

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Estrutura OneDrive (somente XLSX — sem .txt nem evidências soltas):
 *
 * Relatório operacional:
 *   Relatórios Operacionais/Relatório {ts}/{Corretiva|Preventiva|Geral}/
 *     Relatorio OS ….xlsx
 *     OS-1 • …/
 *       ….xlsx
 *
 * Relatório individual de OS:
 *   Relatórios Ordens de Serviço/{OS} {ts}/
 *     ….xlsx  (com abas Checklist/Evidências/Pausas/Comentários)
 */
export function construirPacoteExportacaoPorTipo(params: {
  workOrders: ReportExportPackageWorkOrderInput[];
  typeReports: ReportExportPackageTypeReportInput[];
  osReports: ReportExportPackageOsReportInput[];
  exportedAt?: Date;
}): ReportExportPackageBuildResult {
  const exportedAt = params.exportedAt ?? new Date();
  const isOperational = params.typeReports.some(
    (report) => Boolean(report.buffer?.length),
  );
  if (isOperational) {
    return construirPacoteOperacional({
      workOrders: params.workOrders,
      typeReports: params.typeReports,
      osReports: params.osReports,
      exportedAt,
    });
  }
  return construirPacoteOsIndividual({
    workOrders: params.workOrders,
    osReports: params.osReports,
    exportedAt,
  });
}

function construirPacoteOperacional(params: {
  workOrders: ReportExportPackageWorkOrderInput[];
  typeReports: ReportExportPackageTypeReportInput[];
  osReports: ReportExportPackageOsReportInput[];
  exportedAt: Date;
}): ReportExportPackageBuildResult {
  const files: ReportExportPackageFile[] = [];
  const workOrderFolderNames: string[] = [];
  const usedFolderNamesByType = new Map<string, Set<string>>();
  const sessionFolder = montarPastaSessaoRelatorioOperacional(params.exportedAt);
  const ensureFolders = PASTAS_TIPO_OS.map(
    (typeFolder) => `${sessionFolder}/${typeFolder}`,
  );
  for (const report of params.typeReports) {
    if (!report.buffer?.length) continue;
    const typeFolder = sanitizarSegmentoPath(report.typeFolder);
    const fileName = sanitizarSegmentoPath(
      report.fileName || `Relatorio OS ${typeFolder}.xlsx`,
    );
    files.push({
      relativePath: `${sessionFolder}/${typeFolder}/${fileName}`,
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
    const osPath = `${sessionFolder}/${typeFolder}/${folderName}`;
    workOrderFolderNames.push(osPath);
    anexarExcelDaOs({
      files,
      osPath,
      osReport,
      folderName,
    });
  }
  return {
    packageFolderName: sessionFolder,
    files,
    workOrderFolderNames,
    ensureFolders,
  };
}

function construirPacoteOsIndividual(params: {
  workOrders: ReportExportPackageWorkOrderInput[];
  osReports: ReportExportPackageOsReportInput[];
  exportedAt: Date;
}): ReportExportPackageBuildResult {
  const files: ReportExportPackageFile[] = [];
  const workOrderFolderNames: string[] = [];
  const usedFolderNames = new Set<string>();
  const osReportByWorkOrderId = new Map(
    params.osReports.map((report) => [report.workOrderId, report]),
  );
  let packageFolderName = montarPastaSessaoRelatorioOs('OS', params.exportedAt);
  for (const order of params.workOrders) {
    const osReport = osReportByWorkOrderId.get(order.id);
    let folderNameBase = osReport?.folderName?.trim()
      ? sanitizarSegmentoPath(osReport.folderName)
      : montarNomePastaOrdem(order);
    folderNameBase = garantirNomeUnico(folderNameBase, usedFolderNames);
    usedFolderNames.add(folderNameBase.toLowerCase());
    const osPath = montarPastaSessaoRelatorioOs(
      folderNameBase,
      params.exportedAt,
    );
    packageFolderName = osPath;
    workOrderFolderNames.push(osPath);
    anexarExcelDaOs({
      files,
      osPath,
      osReport,
      folderName: folderNameBase,
    });
  }
  return {
    packageFolderName,
    files,
    workOrderFolderNames,
    ensureFolders: workOrderFolderNames,
  };
}

/** Anexa apenas o XLSX da OS (sem .txt nem evidências soltas). */
function anexarExcelDaOs(params: {
  files: ReportExportPackageFile[];
  osPath: string;
  osReport: ReportExportPackageOsReportInput | undefined;
  folderName: string;
}): void {
  const { files, osPath, osReport, folderName } = params;
  if (!osReport?.buffer?.length) return;
  const osFileName = sanitizarSegmentoPath(`${folderName}.xlsx`);
  files.push({
    relativePath: `${osPath}/${osFileName}`,
    buffer: osReport.buffer,
    contentType: osReport.contentType || XLSX_MIME,
  });
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
