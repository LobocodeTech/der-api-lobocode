import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  AssetType,
  WorkOrderStatus,
  WorkOrderType,
} from '@prisma/client';
import { IsCUID } from '../../../shared/validators';

export const REPORT_PERIODS = [
  'today',
  'yesterday',
  'last-7-days',
  'last-15-days',
  'last-30-days',
  'current-month',
  'previous-month',
  'custom',
] as const;

export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const REPORT_SLA_BUCKETS = ['ON_TIME', 'NEAR_DUE', 'OVERDUE'] as const;
export type ReportSlaBucket = (typeof REPORT_SLA_BUCKETS)[number];

export class WorkOrderReportFilterDto {
  @IsOptional()
  @IsIn(REPORT_PERIODS)
  period?: ReportPeriod;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(WorkOrderType)
  type?: WorkOrderType;

  @IsOptional()
  @IsIn(REPORT_SLA_BUCKETS)
  slaBucket?: ReportSlaBucket;

  @IsOptional()
  @IsCUID()
  locationId?: string;

  @IsOptional()
  @IsCUID()
  regionalId?: string;

  @IsOptional()
  @IsEnum(AssetType)
  equipmentType?: AssetType;

  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

  @IsOptional()
  @IsCUID()
  createdById?: string;

  @IsOptional()
  @IsCUID()
  assigneeId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
