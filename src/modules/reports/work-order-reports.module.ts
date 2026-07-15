import { Module } from '@nestjs/common';
import { FilesModule } from 'src/shared/files/files.module';
import { PrismaModule } from 'src/shared/prisma/prisma.module';
import { TenantModule } from 'src/shared/tenant/tenant.module';
import { OneDriveModule } from '../onedrive/onedrive.module';
import { WorkOrderQueueUsersService } from '../work-orders/work-order-queue-users/work-order-queue-users.service';
import { WorkOrderOneDriveExportService } from './work-order-onedrive-export.service';
import { WorkOrderReportsController } from './work-order-reports.controller';
import { WorkOrderReportsService } from './work-order-reports.service';

@Module({
  imports: [PrismaModule, TenantModule, OneDriveModule, FilesModule],
  controllers: [WorkOrderReportsController],
  providers: [
    WorkOrderReportsService,
    WorkOrderQueueUsersService,
    WorkOrderOneDriveExportService,
  ],
  exports: [WorkOrderReportsService],
})
export class WorkOrderReportsModule {}