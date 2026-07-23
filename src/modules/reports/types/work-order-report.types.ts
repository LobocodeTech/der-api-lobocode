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

export interface WorkOrderReportActorMemberRef {
  id: string;
  name: string;
  level: string;
}

/** Ator do ciclo de vida da OS (iniciou / finalizou / aprovou). */
export interface WorkOrderReportActorRef {
  id: string;
  name: string;
  fieldTeamMembers: WorkOrderReportActorMemberRef[];
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
  startedByUser: WorkOrderReportActorRef | null;
  completedByUser: WorkOrderReportActorRef | null;
  /** Preenchido somente em OS corretiva aprovada. */
  approvedByUser: WorkOrderReportActorRef | null;
  assignee: WorkOrderReportUserRef | null;
  queues: WorkOrderReportQueueRef[];
  slaBucket: ReportSlaBucket | null;
  corrective?: WorkOrderReportCorrectiveMetrics;
  correctiveLive?: WorkOrderReportCorrectiveLiveContext;
  dueDateSla?: WorkOrderReportDueDateMetrics;
  dueDateLive?: WorkOrderReportDueDateLiveContext;
  /** Detalhes da OS — preenchidos no endpoint de export (abas Excel por OS). */
  checklistItems?: WorkOrderReportChecklistItem[];
  evidences?: WorkOrderReportEvidenceItem[];
  pauseEvents?: WorkOrderReportPauseEventItem[];
  comments?: WorkOrderReportCommentItem[];
}

export interface WorkOrderReportChecklistItem {
  label: string;
  isDone: boolean;
  sortOrder: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderReportEvidenceItem {
  originalName: string;
  mimeType: string;
  description: string | null;
  size: number;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderReportPauseEventItem {
  eventType: 'PAUSE' | 'RESUME' | string;
  reason: string;
  authorName: string | null;
  createdAt: string;
  /** Segundos pausados do ciclo (preenchido no cliente/servidor). */
  pausedSeconds?: number | null;
}

export interface WorkOrderReportCommentItem {
  authorName: string | null;
  text: string;
  createdAt: string;
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
  preventivePauses: {
    totalCount: number;
    totalPausedSeconds: number;
  };
  preventiveReturns: {
    totalCount: number;
  };
  generalPauses: {
    totalCount: number;
    totalPausedSeconds: number;
  };
  generalReturns: {
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
