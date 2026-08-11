import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpStatus,
  HttpCode,
  Query,
  BadRequestException,
  UseInterceptors,
} from '@nestjs/common';
import { RequiredRoles } from 'src/shared/auth/required-roles.decorator';
import { Roles } from '@prisma/client';
import { UniversalService } from '../services/universal.service';
import { TenantInterceptor } from 'src/shared/tenant/tenant.interceptor';
import { CaslInterceptor } from 'src/shared/casl/interceptors/casl.interceptor';

@UseInterceptors(TenantInterceptor, CaslInterceptor)
@Controller()
export abstract class UniversalController<
  DtoCreate,
  DtoUpdate,
  Service extends UniversalService<DtoCreate, DtoUpdate>,
> {
  constructor(protected readonly service: Service) {}

  // ============================================================================
  // 📊 MÉTRICAS PROMETHEUS (NOVO)
  // ============================================================================

  @Get('metrics')
  @RequiredRoles(Roles.SYSTEM_ADMIN, Roles.ADMIN)
  async obterMetricas(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('entity') entity?: string,
  ) {
    // Query direto do Prometheus
    const resolvedEntity = entity ?? (this.service as any).entityName;
    const timeRange =
      startDate && endDate
        ? `[${this.calculateTimeRange(startDate, endDate)}]`
        : '[1h]';

    return this.getMetrics(resolvedEntity, timeRange);
  }

  // ============================================================================
  // 🔍 BUSCA ESPECIALIZADA
  // ============================================================================

  @Get('search/name')
  buscarPorNome(@Query('name') name: string) {
    if (!name) {
      throw new BadRequestException('Nome é obrigatório para a busca');
    }
    return this.service.buscarMuitosPorCampo('name', name);
  }

  @Get('search/field')
  buscarPorCampo(@Query('field') field: string, @Query('value') value: string) {
    if (!field || !value) {
      throw new BadRequestException(
        'Campo e valor são obrigatórios para a busca',
      );
    }
    return this.service.buscarPorCampo(field, value);
  }

  // ============================================================================
  // 📋 CRUD BÁSICO
  // ============================================================================

  @Get()
  buscarComPaginacao(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('city') city?: string,
    @Query('regionalId') regionalId?: string,
    @Query('locationId') locationId?: string,
    @Query('orderBy') orderBy?: string,
  ) {
    return this.service.buscarComPaginacao(page, limit, undefined, {
      search,
      status,
      city,
      regionalId,
      locationId,
      orderBy,
    });
  }

  @Get('all')
  buscarTodos() {
    return this.service.buscarTodos();
  }

  @Get(':id')
  buscarPorId(@Param('id') id: string) {
    return this.service.buscarPorId(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  criar(@Body() createShiftDto: DtoCreate) {
    return this.service.criar(createShiftDto);
  }

  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() updateShiftDto: DtoUpdate) {
    return this.service.atualizar(id, updateShiftDto);
  }

  @Delete(':id')
  desativar(@Param('id') id: string) {
    return this.service.desativar(id);
  }

  @Post(':id/restore')
  reativar(@Param('id') id: string) {
    return this.service.reativar(id);
  }

  // ============================================================================
  // 🔧 HELPER METHODS
  // ============================================================================

  private calculateTimeRange(startDate: string, endDate: string): string {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffHours =
      Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60);

    if (diffHours <= 1) return '1h';
    if (diffHours <= 24) return '24h';
    if (diffHours <= 168) return '7d';
    return '30d';
  }

  private getMetrics(entity: string, timeRange: string) {
    return {
      // Contador total de operações
      total_operations: {
        query: `sum(departamento_estadual_rodovias_entity_operations_total{entity="${entity}"})`,
        prometheus_url: `http://localhost:19090/api/v1/query?query=sum(departamento_estadual_rodovias_entity_operations_total{entity="${entity}"})`,
      },

      // Taxa de operações por minuto
      operations_rate: {
        query: `rate(departamento_estadual_rodovias_entity_operations_total{entity="${entity}"}${timeRange})`,
        prometheus_url: `http://localhost:19090/api/v1/query?query=rate(departamento_estadual_rodovias_entity_operations_total{entity="${entity}"}${timeRange})`,
      },

      // Duração média das operações
      avg_duration: {
        query: `rate(departamento_estadual_rodovias_operation_duration_seconds_sum{entity="${entity}"}${timeRange}) / rate(departamento_estadual_rodovias_operation_duration_seconds_count{entity="${entity}"}${timeRange})`,
        prometheus_url: `http://localhost:19090/api/v1/query?query=rate(departamento_estadual_rodovias_operation_duration_seconds_sum{entity="${entity}"}${timeRange})/rate(departamento_estadual_rodovias_operation_duration_seconds_count{entity="${entity}"}${timeRange})`,
      },

      // Operações por status
      by_status: {
        query: `sum(departamento_estadual_rodovias_entity_operations_total{entity="${entity}"}) by (status)`,
        prometheus_url: `http://localhost:19090/api/v1/query?query=sum(departamento_estadual_rodovias_entity_operations_total{entity="${entity}"}) by (status)`,
      },

      // Operações por ação
      by_action: {
        query: `sum(departamento_estadual_rodovias_entity_operations_total{entity="${entity}"}) by (action)`,
        prometheus_url: `http://localhost:19090/api/v1/query?query=sum(departamento_estadual_rodovias_entity_operations_total{entity="${entity}"}) by (action)`,
      },

      info: {
        message: 'Métricas agora vêm do Prometheus',
        grafana_dashboard: 'http://localhost:30101', // departamento-estadual-rodovias: bloco 30xxx
        prometheus_ui: 'http://localhost:19090', // departamento-estadual-rodovias: bloco 19xxx
      },
    };
  }
}
