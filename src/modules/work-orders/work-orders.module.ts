import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { FilesModule } from 'src/shared/files/files.module';
import { WorkOrdersController } from './work-order-queue-users/work-orders.controller';
import { WorkOrderColumnsController } from './work-order-columns/work-order-columns.controller';
import { WorkOrderPauseHistoryController } from './work-order-pause-history/work-order-pause-history.controller';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrderColumnsService } from './work-order-columns/work-order-columns.service';
import { WorkOrderPauseHistoryService } from './work-order-pause-history/work-order-pause-history.service';
import { WorkOrderQueueUsersService } from './work-order-queue-users/work-order-queue-users.service';
import {
  WorkOrdersIntegrationController,
  WorkOrdersIntegrationCorsMiddleware,
  WorkOrdersIntegrationRateLimitGuard,
  WorkOrdersIntegrationService,
} from './integration';

@Module({
  imports: [FilesModule],
  controllers: [
    WorkOrdersController,
    WorkOrderColumnsController,
    WorkOrderPauseHistoryController,
    WorkOrdersIntegrationController,
  ],
  providers: [
    WorkOrdersService,
    WorkOrderColumnsService,
    WorkOrderPauseHistoryService,
    WorkOrderQueueUsersService,
    WorkOrdersIntegrationService,
    WorkOrdersIntegrationRateLimitGuard,
  ],
  exports: [
    WorkOrdersService,
    WorkOrderColumnsService,
    WorkOrderPauseHistoryService,
    WorkOrderQueueUsersService,
    WorkOrdersIntegrationService,
  ],
})
export class WorkOrdersModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(WorkOrdersIntegrationCorsMiddleware)
      .forRoutes(
        { path: 'integration/work-orders', method: RequestMethod.ALL },
        { path: 'integration/work-orders/(.*)', method: RequestMethod.ALL },
      );
  }
}

