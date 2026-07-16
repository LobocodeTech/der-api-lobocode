import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, WorkOrderType } from '@prisma/client';
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

/** Só o necessário para nomear pastas — detalhes vão no XLSX gerado no frontend. */
const PACOTE_WORK_ORDER_INCLUDE = {
  location: {
    select: {
      code: true,
      referenceKm: true,
      name: true,
    },
  },
} satisfies Prisma.WorkOrderInclude;

type UploadedReportFile = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
};

/**
 * Orquestra export OneDrive:
 * DER/Relatórios Operacionais/Relatório {data hora}/{Corretiva|Preventiva|Geral}/…
 * DER/Relatórios Ordens de Serviço/{OS} {data hora}/…
 * Somente XLSX (sem .txt nem evidências soltas).
 */
@Injectable()
export class WorkOrderOneDriveExportService {
  private readonly logger = new Logger(WorkOrderOneDriveExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queryService: UniversalQueryService,
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
    const workOrders = this.montarEntradasPacote(registros);
    const pacote = construirPacoteExportacaoPorTipo({
      workOrders,
      typeReports,
      osReports,
    });
    const upload = await this.oneDriveUploadService.enviarPacote({
      files: pacote.files,
      ensureFolders: pacote.ensureFolders,
    });
    this.logger.log(
      `Pacote OneDrive enviado: ${pacote.packageFolderName || upload.packagePath} (enviados=${upload.uploadedFiles}, ignorados=${upload.skippedFiles}, ${workOrders.length} OS) pastas=[${pacote.workOrderFolderNames.join(' | ')}] share=${upload.folderShareUrl}`,
    );
    return {
      id: pacote.packageFolderName || upload.packagePath,
      name: pacote.packageFolderName || upload.packagePath,
      webUrl: upload.folderShareUrl,
      folderShareUrl: upload.folderShareUrl,
      size: null as number | null,
      packagePath: pacote.packageFolderName || upload.packagePath,
      uploadedFiles: upload.uploadedFiles,
      skippedFiles: upload.skippedFiles,
      workOrderCount: workOrders.length,
      workOrderFolders: pacote.workOrderFolderNames,
    };
  }

  /**
   * Retorna o link anônimo da pasta mãe OneDrive (reusa se já existir).
   */
  async obterLinkPublicoPastaRaiz(): Promise<{
    packagePath: string;
    folderShareUrl: string;
    webUrl: string;
  }> {
    const packagePath = this.oneDriveUploadService.obterPastaDestino();
    const folderShareUrl =
      await this.oneDriveUploadService.obterOuCriarLinkPublicoPastaRaiz();
    return {
      packagePath,
      folderShareUrl,
      webUrl: folderShareUrl,
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

  private montarEntradasPacote(
    registros: Array<{
      id: string;
      sequentialNumber: string | null;
      type: WorkOrderType;
      location: {
        code: string | null;
        referenceKm: string | null;
        name: string | null;
      } | null;
    }>,
  ): ReportExportPackageWorkOrderInput[] {
    return registros.map((registro) => ({
      id: registro.id,
      sequentialNumber: registro.sequentialNumber,
      type: registro.type,
      locationCode: registro.location?.code,
      locationKm: registro.location?.referenceKm,
      checklistItems: [],
      pauseEvents: [],
      comments: [],
      evidences: [],
    }));
  }
}
