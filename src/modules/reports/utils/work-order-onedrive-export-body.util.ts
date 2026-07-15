import { BadRequestException } from '@nestjs/common';
import { WorkOrderReportFilterDto } from '../dto/work-order-report-filter.dto';
import type {
  OneDriveExportManifest,
  ReportExportTypeFolder,
  ReportExportTypeSelection,
} from '../export-package/report-export-package.types';

const TYPE_FOLDERS = new Set<ReportExportTypeFolder>([
  'Corretiva',
  'Preventiva',
  'Geral',
]);

/**
 * Faz parse do campo multipart `filters` do export OneDrive.
 */
export function parsearFiltrosExportOneDrive(
  raw?: string,
): WorkOrderReportFilterDto {
  if (!raw?.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw) as WorkOrderReportFilterDto;
  } catch {
    throw new BadRequestException('Campo filters deve ser um JSON válido.');
  }
}

/**
 * Faz parse do campo multipart `exportTypes` do export OneDrive.
 */
export function parsearTiposExportOneDrive(
  raw?: string,
): ReportExportTypeSelection {
  if (!raw?.trim()) {
    return { corrective: true, preventive: true, general: true };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ReportExportTypeSelection>;
    return {
      corrective: Boolean(parsed.corrective),
      preventive: Boolean(parsed.preventive),
      general: Boolean(parsed.general),
    };
  } catch {
    throw new BadRequestException('Campo exportTypes deve ser um JSON válido.');
  }
}

/**
 * Faz parse e validação do campo multipart `manifest` do export OneDrive.
 */
export function parsearManifestoExportOneDrive(
  raw?: string,
): OneDriveExportManifest {
  if (!raw?.trim()) {
    throw new BadRequestException('Campo manifest é obrigatório.');
  }
  try {
    const parsed = JSON.parse(raw) as OneDriveExportManifest;
    const typeReports = Array.isArray(parsed.typeReports)
      ? parsed.typeReports
      : [];
    const osReports = Array.isArray(parsed.osReports) ? parsed.osReports : [];
    for (const item of typeReports) {
      if (!TYPE_FOLDERS.has(item.typeFolder)) {
        throw new BadRequestException(
          `typeFolder inválido no manifesto: ${String(item.typeFolder)}`,
        );
      }
    }
    for (const item of osReports) {
      if (!item.workOrderId?.trim()) {
        throw new BadRequestException(
          'osReports[].workOrderId é obrigatório no manifesto.',
        );
      }
      if (!TYPE_FOLDERS.has(item.typeFolder)) {
        throw new BadRequestException(
          `typeFolder inválido no manifesto: ${String(item.typeFolder)}`,
        );
      }
    }
    return { typeReports, osReports };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Campo manifest deve ser um JSON válido.');
  }
}
