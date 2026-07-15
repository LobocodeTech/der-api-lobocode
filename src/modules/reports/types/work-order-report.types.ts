import {
  AssetType,
  WorkOrderCorrectiveSlaStatus,
  WorkOrderPriority,
  WorkOrderSlaStatus,
  WorkOrderStatus,
  WorkOrderType,
} from '@prisma/client';
import { ReportSlaBucket } from '../dto/work-order-report-filter.dto';

export interface WorkOrderReportUserRef {
  id: string;
  name: string;
}

export interface WorkOrderReportQueueRef {
  id: string;
  title: string;
  users: WorkOrderReportUserRef[];
}

export interface WorkOrderReportLocationRef {
  id: string;
  name: string | null;
  code: string | null;
  city: string | null;
  referenceKm: string | null;
  regional: {
    id: string;
    name: string | null;
    cgr: string | null;
    city: string | null;
  } | null;
}

export interface WorkOrderReportCorrectiveLiveContext {
  slaStartAt: string | null;
  slaPausedAt: string | null;
  slaResumedAt: string | null;
  slaConsumedSeconds: number;
  slaRemainingSeconds: number | null;
  slaDeadlineAt: string | null;
  slaStatusExtended: string | null;
  slaDeadlineHours: number | null;
  correctiveSlaDefaultSeconds: number;
  correctiveSlaWindowStart: string;
  correctiveSlaWindowEnd: string;
  pauseHistories: Array<{
    eventType: 'PAUSE' | 'RESUME';
    createdAt: string;
  }>;
}

export interface WorkOrderReportCorrectiveMetrics {
  totalExecutionSeconds: number;
  workedSeconds: number;
  pausedSeconds: number;
  overdueSeconds: number;
  withinSlaSeconds: number;
  slaPositiveSeconds: number;
  slaNegativeSeconds: number;
  pauseCount: number;
  totalPausedSeconds: number;
  firstPauseAt: string | null;
  lastPauseAt: string | null;
  returnCount: number;
  firstReturnAt: string | null;
  lastReturnAt: string | null;
  isLate: boolean;
  lateSeconds: number;
  latePercentOfSla: number;
}

export interface WorkOrderReportDueDateMetrics {
  slaBucket: ReportSlaBucket;
  slaStatus: WorkOrderSlaStatus;
  dueDate: string | null;
  remainingSeconds: number;
  exceededSeconds: number;
  pauseCount: number;
  totalPausedSeconds: number;
  pausedSeconds: number;
  firstPauseAt: string | null;
  lastPauseAt: string | null;
  returnCount: number;
  firstReturnAt: string | null;
  lastReturnAt: string | null;
}

export interface WorkOrderReportDueDateLiveContext {
  slaPausedAt: string | null;
  pauseHistories: Array<{
    eventType: 'PAUSE' | 'RESUME';
    createdAt: string;
  }>;
}

export interface WorkOrderReportItem {
  id: string;
  sequentialNumber: string | null;
  title: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  priority: WorkOrderPriority | null;
  equipmentType: AssetType | null;
  location: WorkOrderReportLocationRef | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  finalApprovalCompletedAt: string | null;
  createdByUser: WorkOrderReportUserRef | null;
  assignee: WorkOrderReportUserRef | null;
  queues: WorkOrderReportQueueRef[];
  slaBucket: ReportSlaBucket | null;
  corrective?: WorkOrderReportCorrectiveMetrics;
  correctiveLive?: WorkOrderReportCorrectiveLiveContext;
  dueDateSla?: WorkOrderReportDueDateMetrics;
  dueDateLive?: WorkOrderReportDueDateLiveContext;
}

export interface WorkOrderReportSummary {
  corrective: {
    total: number;
    inProgress: number;
    completed: number;
    overdue: number;
  };
  preventive: {
    total: number;
    inProgress: number;
    completed: number;
    overdue: number;
  };
  general: {
    total: number;
    inProgress: number;
    completed: number;
    overdue: number;
  };
  sla: {
    positive: number;
    negative: number;
    complianceRate: number;
  };
  preventiveSla: {
    onTime: number;
    nearDue: number;
    overdue: number;
    complianceRate: number;
  };
  generalSla: {
    onTime: number;
    nearDue: number;
    overdue: number;
    complianceRate: number;
  };
  pauses: {
    totalCount: number;
    totalPausedSeconds: number;
  };
  returns: {
    totalCount: number;
  };
}

export interface WorkOrderReportListResponse {
  data: WorkOrderReportItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface WorkOrderReportExportResponse {
  summary: WorkOrderReportSummary;
  corrective: WorkOrderReportItem[];
  preventive: WorkOrderReportItem[];
  general: WorkOrderReportItem[];
  generatedAt: string;
}

export type WorkOrderReportSortField =
  | 'sequentialNumber'
  | 'status'
  | 'priority'
  | 'createdAt'
  | 'startedAt'
  | 'completedAt'
  | 'type';

export const CORRECTIVE_SLA_POSITIVE_STATUSES: WorkOrderCorrectiveSlaStatus[] = [
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED_ON_TIME',
];

export const CORRECTIVE_SLA_NEAR_STATUSES: WorkOrderCorrectiveSlaStatus[] = [
  'NEAR_BREACH',
];

export const CORRECTIVE_SLA_NEGATIVE_STATUSES: WorkOrderCorrectiveSlaStatus[] = [
  'BREACHED',
  'COMPLETED_LATE',
];
