import { Inject, Injectable, NotFoundException, Optional, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import {
  UniversalMetricsService,
  UniversalPermissionService,
  UniversalQueryService,
  UniversalRepository,
  UniversalService,
  createEntityConfig,
} from 'src/shared/universal';
import { CreateWorkOrderDto } from '../../dto/create-work-order.dto';
import { UpdateWorkOrderDto } from '../../dto/update-work-order.dto';
import { WORK_ORDER_QUEUE_INCLUDE } from '../../work-order-queue-users/work-order-queue-users.service';
import { WORK_ORDER_AUDIT_USER_INCLUDE } from '../../dto/work-order-audit.fields';

@Injectable({ scope: Scope.REQUEST })
export class WorkOrdersIntegrationService extends UniversalService<
  CreateWorkOrderDto,
  UpdateWorkOrderDto
> {
  private static readonly entityConfig = createEntityConfig('workOrder');
  private readonly osFields = [
    'id',
    'sequentialNumber',
    'title',
    'description',
    'type',
    'status',
    'priority',
    'dueDate',
    'createdBy',
    'updatedBy',
    'createdByUser',
    'updatedByUser',
    'equipmentType',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'location',
    'planning',
    'column',
    'workOrderQueues',
  ] as const;

  constructor(
    repository: UniversalRepository<CreateWorkOrderDto, UpdateWorkOrderDto>,
    queryService: UniversalQueryService,
    permissionService: UniversalPermissionService,
    metricsService: UniversalMetricsService,
    @Optional() @Inject(REQUEST) request: any,
  ) {
    const { model, casl } = WorkOrdersIntegrationService.entityConfig;
    super(
      repository,
      queryService,
      permissionService,
      metricsService,
      request,
      model,
      casl,
    );

    this.setEntityConfig();
  }

  setEntityConfig() {
    this.entityConfig = {
      ...this.entityConfig,
      includes: {
        column: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        location: {
          select: {
            id: true,
            code: true,
            referenceKm: true,
            city: true,
            regional: {
              select: {
                id: true,
                cgr: true,
                city: true,
                color: true,
              },
            },
          },
        },
        planning: {
          select: {
            id: true,
            title: true,
            serviceType: true,
            equipmentType: true,
            date: true,
            km: true,
            observation: true,
          },
        },
        workOrderQueues: {
          include: WORK_ORDER_QUEUE_INCLUDE,
        },
        ...WORK_ORDER_AUDIT_USER_INCLUDE,
      },
      where: {
        deletedAt: null,
      },
      transform: {
        custom: (data: any) => {
          const pick = (item: any) => {
            if (!item || typeof item !== 'object') return item;
            const limited: Record<string, any> = {};
            for (const field of this.osFields) {
              if (field in item) limited[field] = item[field];
            }
            return limited;
          };

          return Array.isArray(data) ? data.map(pick) : pick(data);
        },
      },
    };
  }

  private getWherePublicoBase() {
    return { ...(this.getEntityConfig().where ?? {}) } as Record<string, unknown>;
  }

  async buscarTodos() {
    const includeConfig = this.getIncludeConfig();
    const defaultOrderBy = this.getEntityConfig().orderBy ?? { createdAt: 'desc' };
    const entities = await this.repository.buscarMuitos(
      this.entityName,
      this.getWherePublicoBase(),
      { orderBy: defaultOrderBy },
      includeConfig,
    );

    if(entities.length === 0 || !entities) {
      throw new NotFoundException('Nenhuma ordem de serviço encontrada');
    }

    return this.transformData(entities);
  }

  async buscarPorId(id: string, include?: any) {
    const includeConfig = include || this.getIncludeConfig();
    const entity = await this.repository.buscarPrimeiro(
      this.entityName,
      { ...this.getWherePublicoBase(), id },
      includeConfig,
    );

    this.validarResultadoDaBusca(entity, this.entityName, 'id', id);

    return { data: this.transformData(entity) };
  }

  async buscarPorCampo(field: string, value: any, include?: any) {
    const includeConfig = include || this.getIncludeConfig();
    const entity = await this.repository.buscarPrimeiro(
      this.entityName,
      { ...this.getWherePublicoBase(), [field]: value },
      includeConfig,
    );

    this.validarResultadoDaBusca(entity, this.entityName, field, value);

    return { data: this.transformData(entity) };
  }
}
