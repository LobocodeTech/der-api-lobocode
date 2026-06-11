import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { Roles } from '@prisma/client';
import { AuthGuard } from 'src/shared/auth/guards/auth.guard';
import { RoleByMethodGuard } from 'src/shared/auth/guards/role-by-method.guard';
import { RoleByMethod } from 'src/shared/auth/role-by-method.decorator';
import { TenantInterceptor } from 'src/shared/tenant';
import { WorkOrderReportFilterDto } from './dto/work-order-report-filter.dto';
import { WorkOrderReportsService } from './work-order-reports.service';

@UseGuards(AuthGuard, RoleByMethodGuard)
@UseInterceptors(TenantInterceptor)
@RoleByMethod({
  GET: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.FIELD_TEAM],
})
@Controller('reports/work-orders')
export class WorkOrderReportsController {
  constructor(private readonly service: WorkOrderReportsService) {}

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
}
