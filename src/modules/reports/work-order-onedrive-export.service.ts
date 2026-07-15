import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, WorkOrderType } from '@prisma/client';
import { FilesService } from 'src/shared/files/services/files.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { UniversalQueryService } from 'src/shared/universal';
import { OneDriveUploadService } from '../onedrive/services/onedrive-upload.service';
import { WorkOrderReportFilterDto } from './dto/work-order-report-filter.dto';
import { construirPacoteExportacaoPorTipo } from './export-package/report-export-package.builder';
import type {
  OneDriveExportManifest,
  ReportExportPackageOsReportInput,
  ReportExportPackageTypeReportInput,
  ReportExportPackageWorkOrderInput,
  ReportExportTypeSelection,
} from './export-package/report-export-package.types';
import { resolverIntervaloPeriodoRelatorio } from './utils/work-order-report-period.util';

const EXPORT_MAX_ROWS = 10_000;
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const PACOTE_WORK_ORDER_INCLUDE = {
  location: {
    select: {
      code: true,
      referenceKm: true,
      name: true,
    },
  },
  checklistItems: {
    select: { label: true, isDone: true, sortOrder: true },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  workOrderPauseHistories: {
    select: {
      eventType: true,
      reason: true,
      createdAt: true,
      pausedByUser: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  comments: {
    select: {
      text: true,
      createdAt: true,
      author: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  evidences: {
    select: {
      id: true,
      fileId: true,
      file: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.WorkOrderInclude;

type UploadedReportFile = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
};

/**
 * Orquestra export OneDrive por tipo:
 * DER_Relatórios_OS/{Corretiva|Preventiva|Geral}/Relatorio.xlsx
 * + pastas por OS (Relatorio.xlsx sem resumo + checklist + evidências).
 */
@Injectable()
export class WorkOrderOneDriveExportService {
  private readonly logger = new Logger(WorkOrderOneDriveExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queryService: UniversalQueryService,
    private readonly filesService: FilesService,
    private readonly oneDriveUploadService: OneDriveUploadService,
  ) {}

  /**
   * Monta o pacote hierárquico e envia para a conta OneDrive fixa.
   */
  async exportarPacoteParaOneDrive(params: {
    filtros: WorkOrderReportFilterDto;
    exportTypes: ReportExportTypeSelection;
    manifest: OneDriveExportManifest;
    files: UploadedReportFile[];
  }) {
    if (!this.temTipoSelecionado(params.exportTypes)) {
      throw new BadRequestException(
        'Selecione ao menos um tipo de OS para exportar (corretivas, preventivas ou gerais).',
      );
    }
    const { typeReports, osReports } = this.mapearArquivosDoManifesto(
      params.manifest,
      params.files,
    );
    const registros = await this.buscarOrdensParaPacote(
      params.filtros,
      params.exportTypes,
    );
    const workOrders = await this.montarEntradasPacote(registros);
    const pacote = construirPacoteExportacaoPorTipo({
      workOrders,
      typeReports,
      osReports,
    });
    const upload = await this.oneDriveUploadService.enviarPacote({
      files: pacote.files,
    });
    this.logger.log(
      `Pacote OneDrive enviado: ${upload.packagePath} (${upload.uploadedFiles} arquivos, ${workOrders.length} OS) pastas=[${pacote.workOrderFolderNames.join(' | ')}]`,
    );
    return {
      id: upload.packagePath,
      name: upload.packagePath,
      webUrl: null as string | null,
      size: null as number | null,
      packagePath: upload.packagePath,
      uploadedFiles: upload.uploadedFiles,
      workOrderCount: workOrders.length,
      workOrderFolders: pacote.workOrderFolderNames,
    };
  }

  private mapearArquivosDoManifesto(
    manifest: OneDriveExportManifest,
    files: UploadedReportFile[],
  ): {
    typeReports: ReportExportPackageTypeReportInput[];
    osReports: ReportExportPackageOsReportInput[];
  } {
    const typeMeta = manifest.typeReports ?? [];
    const osMeta = manifest.osReports ?? [];
    const expected = typeMeta.length + osMeta.length;
    if (files.length !== expected) {
      throw new BadRequestException(
        `Quantidade de arquivos (${files.length}) não confere com o manifesto (${expected}).`,
      );
    }
    let index = 0;
    const typeReports: ReportExportPackageTypeReportInput[] = typeMeta.map(
      (meta) => {
        const file = files[index++];
        return {
          typeFolder: meta.typeFolder,
          fileName: meta.fileName || 'Relatorio.xlsx',
          buffer: file.buffer,
          contentType: file.mimetype || XLSX_MIME,
        };
      },
    );
    const osReports: ReportExportPackageOsReportInput[] = osMeta.map((meta) => {
      const file = files[index++];
      return {
        workOrderId: meta.workOrderId,
        typeFolder: meta.typeFolder,
        folderName: meta.folderName,
        fileName: meta.fileName || 'Relatorio.xlsx',
        buffer: file.buffer,
        contentType: file.mimetype || XLSX_MIME,
      };
    });
    return { typeReports, osReports };
  }

  private temTipoSelecionado(selection: ReportExportTypeSelection): boolean {
    return selection.corrective || selection.preventive || selection.general;
  }

  private async buscarOrdensParaPacote(
    filtros: WorkOrderReportFilterDto,
    exportTypes: ReportExportTypeSelection,
  ) {
    const where = this.montarWhereComTipos(filtros, exportTypes);
    return this.prisma.workOrder.findMany({
      where,
      orderBy: { sequentialNumber: 'asc' },
      take: EXPORT_MAX_ROWS,
      include: PACOTE_WORK_ORDER_INCLUDE,
    });
  }

  private montarWhereComTipos(
    filtros: WorkOrderReportFilterDto,
    exportTypes: ReportExportTypeSelection,
  ): Prisma.WorkOrderWhereInput {
    if (filtros.workOrderId?.trim()) {
      const baseWhere = this.queryService.construirWhereClauseParaRead(
        'WorkOrder',
        {},
      );
      return { AND: [baseWhere, { id: filtros.workOrderId.trim() }] };
    }
    const { start, end } = resolverIntervaloPeriodoRelatorio(
      filtros.period,
      filtros.dateFrom,
      filtros.dateTo,
    );
    const baseWhere = this.queryService.construirWhereClauseParaRead('WorkOrder', {
      createdAt: { gte: start, lte: end },
    });
    const and: Prisma.WorkOrderWhereInput[] = [];
    const types: WorkOrderType[] = [];
    if (exportTypes.corrective) types.push(WorkOrderType.CORRECTIVE);
    if (exportTypes.preventive) types.push(WorkOrderType.PREVENTIVE);
    if (exportTypes.general) types.push(WorkOrderType.GENERAL);
    if (types.length > 0) {
      and.push({ type: { in: types } });
    }
    if (filtros.type) and.push({ type: filtros.type });
    if (filtros.locationId) and.push({ locationId: filtros.locationId });
    if (filtros.regionalId) {
      and.push({ location: { regionalId: filtros.regionalId } });
    }
    if (filtros.equipmentType) and.push({ equipmentType: filtros.equipmentType });
    if (filtros.status) and.push({ status: filtros.status });
    if (filtros.createdById) and.push({ createdBy: filtros.createdById });
    if (filtros.assigneeId) {
      and.push({
        workOrderQueues: {
          some: {
            queue: {
              queueUsers: { some: { userId: filtros.assigneeId } },
            },
          },
        },
      });
    }
    if (filtros.search?.trim()) {
      const termo = filtros.search.trim();
      and.push({
        OR: [
          { sequentialNumber: { contains: termo, mode: 'insensitive' } },
          { title: { contains: termo, mode: 'insensitive' } },
          { location: { name: { contains: termo, mode: 'insensitive' } } },
        ],
      });
    }
    if (and.length === 0) return baseWhere;
    return { AND: [baseWhere, ...and] };
  }

  private async montarEntradasPacote(
    registros: Array<{
      id: string;
      sequentialNumber: string | null;
      type: WorkOrderType;
      location: {
        code: string | null;
        referenceKm: string | null;
        name: string | null;
      } | null;
      checklistItems: Array<{
        label: string;
        isDone: boolean;
        sortOrder: number | null;
      }>;
      workOrderPauseHistories: Array<{
        eventType: string;
        reason: string;
        createdAt: Date;
        pausedByUser: { name: string } | null;
      }>;
      comments: Array<{
        text: string;
        createdAt: Date;
        author: { name: string } | null;
      }>;
      evidences: Array<{
        fileId: string;
        file: { id: string; originalName: string; mimeType: string } | null;
      }>;
    }>,
  ): Promise<ReportExportPackageWorkOrderInput[]> {
    return Promise.all(
      registros.map(async (registro) => {
        const evidenceResults = await Promise.all(
          registro.evidences.map(async (evidence) => {
            if (!evidence.fileId) return null;
            try {
              const file = await this.filesService.obterBufferPorId(
                evidence.fileId,
              );
              return {
                originalName: file.originalName,
                mimeType: file.mimeType,
                buffer: file.buffer,
              } satisfies ReportExportPackageWorkOrderInput['evidences'][number];
            } catch (error) {
              this.logger.warn(
                `Evidência ${evidence.fileId} ignorada: ${
                  error instanceof Error ? error.message : 'erro desconhecido'
                }`,
              );
              return null;
            }
          }),
        );
        const evidences: ReportExportPackageWorkOrderInput['evidences'] = [];
        for (const item of evidenceResults) {
          if (item) evidences.push(item);
        }
        return {
          id: registro.id,
          sequentialNumber: registro.sequentialNumber,
          type: registro.type,
          locationCode: registro.location?.code,
          locationKm: registro.location?.referenceKm,
          checklistItems: registro.checklistItems.map((item) => ({
            label: item.label,
            isDone: item.isDone,
            sortOrder: item.sortOrder,
          })),
          pauseEvents: registro.workOrderPauseHistories.map((event) => ({
            eventType: event.eventType,
            reason: event.reason,
            createdAt: event.createdAt,
            authorName: event.pausedByUser?.name,
          })),
          comments: registro.comments.map((comment) => ({
            text: comment.text,
            createdAt: comment.createdAt,
            authorName: comment.author?.name,
          })),
          evidences,
        };
      }),
    );
  }
}
