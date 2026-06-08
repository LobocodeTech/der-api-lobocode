import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { FilesModule } from 'src/shared/files/files.module';
import { NotificationModule } from '../notifications/notification.module';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersQueueUsersController } from './work-order-queue-users/work-orders-queue-users.controller';
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
import { WorkOrderSlaService } from './services/work-order-sla.service';
import { GeneralPreventiveSlaService } from './services/general-preventive-sla.service';
import { WorkOrderCorrectiveSlaNotificationService } from './services/work-order-corrective-sla-notification.service';

@Module({
  imports: [FilesModule, NotificationModule],
  controllers: [
    WorkOrdersController,
    WorkOrdersQueueUsersController,
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
    WorkOrderSlaService,
    GeneralPreventiveSlaService,
    WorkOrderCorrectiveSlaNotificationService,
  ],
  exports: [
    WorkOrdersService,
    WorkOrderSlaService,
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

