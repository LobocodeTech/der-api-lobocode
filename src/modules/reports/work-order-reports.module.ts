import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/shared/prisma/prisma.module';
import { TenantModule } from 'src/shared/tenant/tenant.module';
import { WorkOrderQueueUsersService } from '../work-orders/work-order-queue-users/work-order-queue-users.service';
import { WorkOrderReportsController } from './work-order-reports.controller';
import { WorkOrderReportsService } from './work-order-reports.service';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [WorkOrderReportsController],
  providers: [WorkOrderReportsService, WorkOrderQueueUsersService],
  exports: [WorkOrderReportsService],
})
export class WorkOrderReportsModule {}
