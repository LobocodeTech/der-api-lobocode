import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Public } from 'src/shared/auth/decorators/public.decorator';
import { UniversalController } from 'src/shared/universal';
import { CreateWorkOrderDto } from '../../dto/create-work-order.dto';
import { UpdateWorkOrderDto } from '../../dto/update-work-order.dto';
import {
  WorkOrderIntegrationIdParamDto,
  WorkOrderIntegrationSequentialParamDto,
} from '../dto/work-orders.integration.params.dto';
import { WorkOrdersIntegrationRateLimitGuard } from '../guards/work-orders.integration-rate-limit.guard';
import { SharedTokenGuard } from '../guards/work-orders.integration.guard';
import { WorkOrdersIntegrationService } from '../services/work-orders.integration.service';

@Public()
@UseGuards(WorkOrdersIntegrationRateLimitGuard, SharedTokenGuard)
@Controller('integration/work-orders')
export class WorkOrdersIntegrationController extends UniversalController<
  CreateWorkOrderDto,
  UpdateWorkOrderDto,
  WorkOrdersIntegrationService
> {
  constructor(service: WorkOrdersIntegrationService) {
    super(service);
  }

  @Get()
  buscarTodos() {
    return this.service.buscarTodos();
  }

  @Get(':id')
  buscarPorIdIntegracao(@Param() { id }: WorkOrderIntegrationIdParamDto) {
    return this.service.buscarPorId(id);
  }

  @Get('sequential/:sequentialNumber')
  buscarPorNumeroSequencialOs(
    @Param()
    { sequentialNumber }: WorkOrderIntegrationSequentialParamDto,
  ) {
    return this.service.buscarPorCampo('sequentialNumber', sequentialNumber);
  }
}
