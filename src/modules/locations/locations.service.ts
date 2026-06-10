import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import {
  UniversalService,
  UniversalRepository,
  UniversalMetricsService,
  UniversalQueryService,
  UniversalPermissionService,
  createEntityConfig,
} from '../../shared/universal';
import { CreateLocationsDto } from './dto/create-locations.dto';
import { UpdateLocationsDto } from './dto/update-locations.dto';

@Injectable({ scope: Scope.REQUEST })
export class LocationsService extends UniversalService<
  CreateLocationsDto,
  UpdateLocationsDto
> {
  private static readonly entityConfig = createEntityConfig('location');

  constructor(
    repository: UniversalRepository<CreateLocationsDto, UpdateLocationsDto>,
    queryService: UniversalQueryService,
    permissionService: UniversalPermissionService,
    metricsService: UniversalMetricsService,
    @Optional() @Inject(REQUEST) request: any,
  ) {
    const { model, casl } = LocationsService.entityConfig;
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
    const companyId = this.obterUsuarioLogado()?.companyId;

    this.entityConfig = {
      ...this.entityConfig,
      where: {
        deletedAt: null,
        ...(companyId && { companyId }),
      },
      orderBy: { name: 'asc' },
      includes: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        regional: {
          select: {
            id: true,
            cgr: true,
            city: true,
            color: true,
          },
        },
      },
      transform: {
        flatten: {
        },
        exclude: ['companyId', 'regionalId'],
      },
    };
  }

  protected async antesDeDesativar(id: string): Promise<void> {
    const companyId = this.obterUsuarioLogado()?.companyId;
    const filtroFilhos = {
      locationId: id,
      deletedAt: null,
      ...(companyId ? { companyId } : {}),
    };

    const [totalWorkOrders, totalAssets, totalIpLocations] = await Promise.all([
      this.repository.contarTodos('workOrder', filtroFilhos),
      this.repository.contarTodos('asset', filtroFilhos),
      this.repository.contarTodos('ipLocation', filtroFilhos),
    ]);

    const bloqueios: string[] = [];
    if (totalWorkOrders > 0) {
      bloqueios.push('ordens de serviço');
    }
    if (totalAssets > 0) {
      bloqueios.push('ativos');
    }
    if (totalIpLocations > 0) {
      bloqueios.push('localidades IP');
    }

    if (bloqueios.length > 0) {
      throw new BadRequestException(
        `Não é possível excluir a localidade porque existem ${bloqueios.join(', ')} vinculados.`,
      );
    }
  }
}

