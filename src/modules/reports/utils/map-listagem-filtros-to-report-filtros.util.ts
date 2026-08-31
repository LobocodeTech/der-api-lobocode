import { WorkOrderStatus, WorkOrderType } from '@prisma/client';
import { ListagemFiltros } from 'src/shared/universal';
import { WorkOrderReportFilterDto } from '../dto/work-order-report-filter.dto';

/** Alinha filtros da listagem de OS com os do relatório (fonte de cumprimento). */
export function mapListagemFiltrosToReportFiltros(
  filtros: ListagemFiltros,
): WorkOrderReportFilterDto {
  const report: WorkOrderReportFilterDto = { period: 'all' };

  const search = filtros.search?.trim();
  if (search) {
    report.search = search;
  }

  if (filtros.type && filtros.type !== 'all') {
    report.type = filtros.type as WorkOrderType;
  }

  if (filtros.regionalId && filtros.regionalId !== 'all') {
    report.regionalId = filtros.regionalId;
  }

  if (filtros.locationId && filtros.locationId !== 'all') {
    report.locationId = filtros.locationId;
  }

  if (filtros.status && filtros.status !== 'all') {
    if (filtros.status === 'overdue') {
      report.slaBucket = 'OVERDUE';
    } else {
      report.status = filtros.status as WorkOrderStatus;
    }
  }

  if (filtros.date) {
    report.period = 'custom';
    report.dateFrom = filtros.date;
    report.dateTo = filtros.date;
  }

  return report;
}
