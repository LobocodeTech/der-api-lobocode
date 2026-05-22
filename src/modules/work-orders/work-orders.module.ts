import { Module } from '@nestjs/common';
import { FilesModule } from 'src/shared/files/files.module';
import { WorkOrderColumnsController } from './work-order-columns/work-order-columns.controller';
import { WorkOrderColumnsService } from './work-order-columns/work-order-columns.service';
import { WorkOrderPauseHistoryController } from './work-order-pause-history/work-order-pause-history.controller';
import { WorkOrderPauseHistoryService } from './work-order-pause-history/work-order-pause-history.service';
import { WorkOrdersController } from './work-order-queue-users/work-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrderQueueUsersService } from './work-order-queue-users/work-order-queue-users.service';

@Module({
  imports: [FilesModule],
  controllers: [
    WorkOrdersController,
    WorkOrderColumnsController,
    WorkOrderPauseHistoryController,
  ],
  providers: [
    WorkOrdersService,
    WorkOrderColumnsService,
    WorkOrderPauseHistoryService,
    WorkOrderQueueUsersService,
  ],
  exports: [
    WorkOrdersService,
    WorkOrderColumnsService,
    WorkOrderPauseHistoryService,
    WorkOrderQueueUsersService,
  ],
})
export class WorkOrdersModule {}

