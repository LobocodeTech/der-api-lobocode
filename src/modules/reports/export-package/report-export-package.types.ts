/**
 * Arquivo em memória de um pacote de exportação (OneDrive hoje; ZIP no futuro).
 */
export interface ReportExportPackageFile {
  /** Caminho relativo ao root do pacote. */
  relativePath: string;
  buffer: Buffer;
  contentType: string;
}

export interface ReportExportTypeSelection {
  corrective: boolean;
  preventive: boolean;
  general: boolean;
}

export type ReportExportTypeFolder = 'Corretiva' | 'Preventiva' | 'Geral';

export interface ReportExportPackageChecklistItem {
  label: string;
  isDone: boolean;
  sortOrder?: number | null;
}

export interface ReportExportPackageEvidenceInput {
  originalName: string;
  mimeType?: string | null;
  buffer: Buffer;
}

export interface ReportExportPackagePauseEventInput {
  eventType: 'PAUSE' | 'RESUME' | string;
  reason: string;
  createdAt: Date;
  authorName?: string | null;
}

export interface ReportExportPackageCommentInput {
  text: string;
  createdAt: Date;
  authorName?: string | null;
}

export interface ReportExportPackageWorkOrderInput {
  id: string;
  sequentialNumber: string | null;
  type: 'CORRECTIVE' | 'PREVENTIVE' | 'GENERAL' | string;
  locationCode?: string | null;
  locationKm?: string | null;
  checklistItems: ReportExportPackageChecklistItem[];
  evidences: ReportExportPackageEvidenceInput[];
  pauseEvents: ReportExportPackagePauseEventInput[];
  comments: ReportExportPackageCommentInput[];
}

export interface ReportExportPackageTypeReportInput {
  typeFolder: ReportExportTypeFolder;
  fileName: string;
  buffer: Buffer;
  contentType?: string;
}

export interface ReportExportPackageOsReportInput {
  workOrderId: string;
  typeFolder: ReportExportTypeFolder;
  folderName: string;
  fileName: string;
  buffer: Buffer;
  contentType?: string;
}

export interface ReportExportPackageBuildResult {
  packageFolderName: string;
  files: ReportExportPackageFile[];
  workOrderFolderNames: string[];
}

/** Manifesto enviado pelo frontend (ordem bate com o array `files` do multipart). */
export interface OneDriveExportManifest {
  typeReports: Array<{
    typeFolder: ReportExportTypeFolder;
    fileName: string;
  }>;
  osReports: Array<{
    workOrderId: string;
    typeFolder: ReportExportTypeFolder;
    folderName: string;
    fileName: string;
  }>;
}
