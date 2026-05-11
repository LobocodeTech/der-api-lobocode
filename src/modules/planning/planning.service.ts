import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { UserStatus } from '@prisma/client';
import {
  UniversalMetricsService,
  UniversalPermissionService,
  UniversalQueryService,
  UniversalRepository,
  UniversalService,
  createEntityConfig,
} from 'src/shared/universal';
import { CreatePlanningDto } from './dto/create-planning.dto';
import { UpdatePlanningDto } from './dto/update-planning.dto';

@Injectable({ scope: Scope.REQUEST })
export class PlanningService extends UniversalService<
  CreatePlanningDto,
  UpdatePlanningDto
> {
  private static readonly entityConfig = createEntityConfig('planning');
  private pendingCreateWorkOrderId: string | null = null;
  private pendingUpdateWorkOrderCurrentId: string | null = null;
  private pendingUpdateWorkOrderNextId: string | null = null;

  constructor(
    repository: UniversalRepository<CreatePlanningDto, UpdatePlanningDto>,
    queryService: UniversalQueryService,
    permissionService: UniversalPermissionService,
    metricsService: UniversalMetricsService,
    @Optional() @Inject(REQUEST) request: any,
  ) {
    const { model, casl } = PlanningService.entityConfig;
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
    const companyId = this.obterCompanyId();
    this.entityConfig = {
      ...this.entityConfig,
      where: {
        deletedAt: null,
        ...(companyId && { companyId }),
      },
      includes: {
        location: {
          select: {
            id: true,
            code: true,
            name: true,
            referenceKm: true,
            regional: {
              select: {
                id: true,
                cgr: true,
                city: true,
              },
            },
          },
        },
        responsibles: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
        workOrder: {
          select: {
            id: true,
            title: true,
            status: true,
            type: true,
          },
        },
      },
      orderBy: { date: 'asc' },
    };
  }

  protected async antesDeCriar(data: CreatePlanningDto): Promise<void> {
    this.validarCompanyId();
    await this.validarResponsaveis(data.responsibleIds);

    if (data.workOrderId) {
      await this.validarWorkOrderDisponivel(data.workOrderId);
    }

    this.pendingCreateWorkOrderId = data.workOrderId ?? null;
    (data as any).responsibles = {
      create: data.responsibleIds.map((userId) => ({
        user: { connect: { id: userId } },
      })),
    };
    (data as any).title = data.title.trim();
    (data as any).date = new Date(data.date);
    (data as any).serviceType = data.serviceType;
    (data as any).equipmentType = data.equipmentType;
    (data as any).km = data.km;
    (data as any).observation = data.observation?.trim() || null;
    (data as any).locationId = data.locationId;
    delete (data as any).responsibleIds;
    delete (data as any).workOrderId;
  }

  protected async depoisDeCriar(data: any): Promise<void> {
    if (!this.pendingCreateWorkOrderId) return;
    await this.repository.atualizar(
      'workOrder',
      { id: this.pendingCreateWorkOrderId },
      { planningId: data.id } as any,
    );
    this.pendingCreateWorkOrderId = null;
  }

  protected async antesDeAtualizar(
    id: string,
    data: UpdatePlanningDto,
  ): Promise<void> {
    this.validarCompanyId();
    const atual = await this.buscarPlanningValido(id);

    if (data.responsibleIds) {
      await this.validarResponsaveis(data.responsibleIds);
      (data as any).responsibles = {
        deleteMany: {},
        create: data.responsibleIds.map((userId) => ({
          user: { connect: { id: userId } },
        })),
      };
      delete (data as any).responsibleIds;
    }

    if (data.title !== undefined) {
      (data as any).title = data.title.trim();
    }
    if (data.date !== undefined) {
      (data as any).date = new Date(data.date);
    }
    if (data.observation !== undefined) {
      (data as any).observation = data.observation?.trim() || null;
    }

    this.pendingUpdateWorkOrderCurrentId = atual.workOrder?.id ?? null;
    this.pendingUpdateWorkOrderNextId =
      data.workOrderId === undefined
        ? this.pendingUpdateWorkOrderCurrentId
        : data.workOrderId;

    if (this.pendingUpdateWorkOrderNextId) {
      await this.validarWorkOrderDisponivel(
        this.pendingUpdateWorkOrderNextId,
        id,
      );
    }

    delete (data as any).workOrderId;
  }

  protected async depoisDeAtualizar(id: string): Promise<void> {
    const current = this.pendingUpdateWorkOrderCurrentId;
    const next = this.pendingUpdateWorkOrderNextId;

    if (current !== next) {
      if (current) {
        await this.repository.atualizar(
          'workOrder',
          { id: current },
          { planningId: null } as any,
        );
      }
      if (next) {
        await this.repository.atualizar(
          'workOrder',
          { id: next },
          { planningId: id } as any,
        );
      }
    }

    this.pendingUpdateWorkOrderCurrentId = null;
    this.pendingUpdateWorkOrderNextId = null;
  }

  protected async antesDeDesativar(id: string): Promise<void> {
    const atual = await this.buscarPlanningValido(id);
    if (atual.workOrder?.id) {
      await this.repository.atualizar(
        'workOrder',
        { id: atual.workOrder.id },
        { planningId: null } as any,
      );
    }
  }

  private async buscarPlanningValido(id: string) {
    const companyId = this.obterCompanyId();
    const planning = await this.repository.buscarPrimeiro(
      'planning',
      {
        id,
        deletedAt: null,
        ...(companyId && { companyId }),
      },
      {
        workOrder: {
          select: { id: true },
        },
      },
    );

    if (!planning) {
      throw new NotFoundException('Planejamento não encontrado.');
    }

    return planning;
  }

  private async validarResponsaveis(ids: string[]) {
    const companyId = this.obterCompanyId();
    if (!companyId) {
      throw new BadRequestException('Empresa do usuário não encontrada.');
    }

    const uniqueIds = Array.from(
      new Set(ids.map((value) => String(value).trim()).filter(Boolean)),
    );
    if (uniqueIds.length === 0) {
      throw new BadRequestException(
        'Informe ao menos um responsável para o planejamento.',
      );
    }

    const users = await this.repository.buscarMuitos('user', {
      deletedAt: null,
      companyId,
      status: UserStatus.ACTIVE,
      id: { in: uniqueIds },
    });

    if (users.length !== uniqueIds.length) {
      throw new BadRequestException('Um ou mais responsáveis são inválidos.');
    }
  }

  private async validarWorkOrderDisponivel(
    workOrderId: string,
    planningIdPermitido?: string,
  ) {
    const companyId = this.obterCompanyId();
    if (!companyId) {
      throw new BadRequestException('Empresa do usuário não encontrada.');
    }

    const workOrder = await this.repository.buscarPrimeiro('workOrder', {
      id: workOrderId,
      companyId,
      deletedAt: null,
    });

    if (!workOrder) {
      throw new NotFoundException('OS informada não encontrada.');
    }

    if (workOrder.planningId && workOrder.planningId !== planningIdPermitido) {
      throw new BadRequestException('A OS já está vinculada a outro planejamento.');
    }
  }

  private validarCompanyId() {
    if (!this.obterCompanyId()) {
      throw new BadRequestException('Empresa do usuário não encontrada.');
    }
  }
}
