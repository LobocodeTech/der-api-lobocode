import {
  Controller,
  Get,
  Post,
  Query,
  UploadedFiles,
  Body,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Roles } from '@prisma/client';
import { AuthGuard } from 'src/shared/auth/guards/auth.guard';
import { RoleByMethodGuard } from 'src/shared/auth/guards/role-by-method.guard';
import { RoleByMethod } from 'src/shared/auth/role-by-method.decorator';
import { TenantInterceptor } from 'src/shared/tenant';
import { WorkOrderReportFilterDto } from './dto/work-order-report-filter.dto';
import {
  parsearFiltrosExportOneDrive,
  parsearManifestoExportOneDrive,
  parsearTiposExportOneDrive,
} from './utils/work-order-onedrive-export-body.util';
import { WorkOrderOneDriveExportService } from './work-order-onedrive-export.service';
import { WorkOrderReportsService } from './work-order-reports.service';

@UseGuards(AuthGuard, RoleByMethodGuard)
@UseInterceptors(TenantInterceptor)
@RoleByMethod({
  GET: [Roles.SYSTEM_ADMIN, Roles.ADMIN],
  POST: [Roles.SYSTEM_ADMIN, Roles.ADMIN],
})
@Controller('reports/work-orders')
export class WorkOrderReportsController {
  constructor(
    private readonly service: WorkOrderReportsService,
    private readonly oneDriveExportService: WorkOrderOneDriveExportService,
  ) {}

  @Get()
  listarRelatorio(@Query() filtros: WorkOrderReportFilterDto) {
    return this.service.listarRelatorio(filtros);
  }

  @Get('summary')
  obterResumo(@Query() filtros: WorkOrderReportFilterDto) {
    return this.service.obterResumo(filtros);
  }

  @Get('export')
  exportarRelatorio(@Query() filtros: WorkOrderReportFilterDto) {
    return this.service.exportarRelatorio(filtros);
  }

  /**
   * Garante pasta mãe pública (qualquer pessoa com o link, só leitura)
   * e devolve a URL compartilhável.
   */
  @Get('export/onedrive/folder-link')
  obterLinkPastaOneDrive() {
    return this.oneDriveExportService.obterLinkPublicoPastaRaiz();
  }

  /**
   * Recebe XLSXs + manifesto + filtros e sobe pacote OneDrive por tipo
   * (Relatorio consolidado na raiz + pasta por OS com checklist/evidências).
   */
  @Post('export/onedrive')
  @UseInterceptors(
    FilesInterceptor('files', 500, {
      limits: {
        fileSize: 50 * 1024 * 1024,
      },
    }),
  )
  @UsePipes()
  async exportarRelatorioParaOneDrive(
    @UploadedFiles()
    files: Array<{
      buffer: Buffer;
      originalname?: string;
      mimetype?: string;
    }> = [],
    @Body('filters') filtersRaw?: string,
    @Body('exportTypes') exportTypesRaw?: string,
    @Body('manifest') manifestRaw?: string,
  ) {
    return this.oneDriveExportService.exportarPacoteParaOneDrive({
      filtros: parsearFiltrosExportOneDrive(filtersRaw),
      exportTypes: parsearTiposExportOneDrive(exportTypesRaw),
      manifest: parsearManifestoExportOneDrive(manifestRaw),
      files: files ?? [],
    });
  }
}
