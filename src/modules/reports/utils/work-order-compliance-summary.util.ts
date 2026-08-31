import type { WorkOrderReportSummary } from '../types/work-order-report.types';

export interface WorkOrderComplianceRates {
  overall: number | null;
  corrective: number | null;
  preventive: number | null;
  general: number | null;
}

/** Mesma regra dos relatórios: null quando não há OS elegíveis ao SLA. */
export function extrairTaxasCumprimento(
  summary: WorkOrderReportSummary,
): WorkOrderComplianceRates {
  const correctiveEligible = summary.sla.positive + summary.sla.negative;
  const preventiveEligible =
    summary.preventiveSla.onTime +
    summary.preventiveSla.nearDue +
    summary.preventiveSla.overdue;
  const generalEligible =
    summary.generalSla.onTime +
    summary.generalSla.nearDue +
    summary.generalSla.overdue;

  const corrective =
    correctiveEligible > 0 ? summary.sla.complianceRate : null;
  const preventive =
    preventiveEligible > 0 ? summary.preventiveSla.complianceRate : null;
  const general =
    generalEligible > 0 ? summary.generalSla.complianceRate : null;

  const totalEligible =
    correctiveEligible + preventiveEligible + generalEligible;
  let overall: number | null = null;
  if (totalEligible > 0) {
    const positiveWeighted =
      summary.sla.positive +
      summary.preventiveSla.onTime +
      summary.preventiveSla.nearDue +
      summary.generalSla.onTime +
      summary.generalSla.nearDue;
    overall = Number(((positiveWeighted / totalEligible) * 100).toFixed(1));
  }

  return { overall, corrective, preventive, general };
}
