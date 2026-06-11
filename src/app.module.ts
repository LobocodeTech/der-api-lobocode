import { IpLocationModule } from './modules/ip-locations/ip-location.module';
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR, APP_PIPE, APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// modules
import { AuthModule } from './shared/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CompaniesModule } from './modules/companies/companies.module';
// Módulos fora do escopo Prisma DEPARTAMENTO ESTADUAL DE RODOVIAS (desabilitados até remoção)
// import { ShiftsModule } from './modules/shifts/shifts.module';
// import { PostsModule } from './modules/posts/posts.module';
// import { PatrolsModule } from './modules/patrols/patrols.module';
import { WorkOrderReportsModule } from './modules/reports/work-order-reports.module';

import { RateLimitMiddleware } from './shared/common/middleware/rate-limit.middleware';
import { GlobalValidationPipe } from './shared/common/pipes/global-validation.pipe';

// modules globais
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { SoftDeleteInterceptor } from './shared/interceptors/soft-delete.interceptor';
import { TenantModule } from './shared/tenant/tenant.module';
import { LoggerModule } from './shared/common/logger/logger.module';
import { MessagesModule } from './shared/common/messages/messages.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { CaslModule } from './shared/casl/casl.module';
import { UniversalModule } from './shared/universal/universal.module';

import {
  HttpExceptionFilter,
  ForbiddenErrorFilter,
  NotFoundErrorFilter,
  ConflictErrorFilter,
  UnauthorizedErrorFilter,
  ValidationErrorFilter,
  InvalidCredentialsErrorFilter,
  AuthErrorFilter,
  RequiredFieldErrorFilter,
  PrismaErrorFilter,
} from './shared/common/filters';
// import { VehiclesModule } from './modules/vehicle/vehicles.module';
// import { PanicEventsModule } from './modules/panic-events/panic-events.module';
import { FilesModule } from './shared/files/files.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { AssetsModule } from './modules/assets/assets.module';
import { RegionalsModule } from './modules/regionals/regionals.module';
import { QueuesModule } from './modules/queues/queues.module';
import { LocationsModule } from './modules/locations/locations.module';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module';
import { OperationalDashboardModule } from './modules/operational-dashboard/operational-dashboard.module';
import { PlanningModule } from './modules/planning/planning.module';
import { GlobalSearchModule } from './modules/global-search/global-search.module';
//javascript es7

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    LoggerModule,
    MessagesModule,
    PrismaModule,
    CaslModule,
    TenantModule,
    UniversalModule,
    PrometheusModule.register(),
    AuthModule,
    UsersModule,
    CompaniesModule,
    FilesModule,
    DocumentsModule,
    NotificationModule,
    AssetsModule,
    RegionalsModule,
    QueuesModule,
    LocationsModule,
    WorkOrdersModule,
    OperationalDashboardModule,
    PlanningModule,
    GlobalSearchModule,
    WorkOrderReportsModule,
    IpLocationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useClass: GlobalValidationPipe,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SoftDeleteInterceptor,
    },
    // Filtros específicos para erros customizados
    {
      provide: APP_FILTER,
      useClass: PrismaErrorFilter,
    },
    {
      provide: APP_FILTER,
      useClass: ForbiddenErrorFilter,
    },
    {
      provide: APP_FILTER,
      useClass: RequiredFieldErrorFilter,
    },
    {
      provide: APP_FILTER,
      useClass: NotFoundErrorFilter,
    },
    {
      provide: APP_FILTER,
      useClass: ConflictErrorFilter,
    },
    {
      provide: APP_FILTER,
      useClass: UnauthorizedErrorFilter,
    },
    {
      provide: APP_FILTER,
      useClass: ValidationErrorFilter,
    },
    {
      provide: APP_FILTER,
      useClass: InvalidCredentialsErrorFilter,
    },
    {
      provide: APP_FILTER,
      useClass: AuthErrorFilter,
    },
    // Filtro para exceções HTTP padrão do NestJS
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}
