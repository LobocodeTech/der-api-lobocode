import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/shared/prisma/prisma.module';
import { TenantModule } from 'src/shared/tenant/tenant.module';
import { WorkOrderReportsController } from './work-order-reports.controller';
import { WorkOrderReportsService } from './work-order-reports.service';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [WorkOrderReportsController],
  providers: [WorkOrderReportsService],
  exports: [WorkOrderReportsService],
})
export class WorkOrderReportsModule {}
