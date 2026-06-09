import { Inject, Injectable, Optional, Scope } from '@nestjs/common';
import {
  UniversalMetricsService,
  UniversalPermissionService,
  UniversalQueryService,
  UniversalRepository,
  UniversalService,
  createEntityConfig,
} from 'src/shared/universal';
import { CreateIpLocationDto } from './dto/create-ip-location-dto';
import { UpdateIpLocationDto } from './dto/update-ip-location-dto';
import { REQUEST } from '@nestjs/core';

@Injectable({ scope: Scope.REQUEST })
export class IpLocationService extends UniversalService<
  CreateIpLocationDto,
  UpdateIpLocationDto
> {
  private static readonly entityConfig = createEntityConfig('ipLocation');

  constructor(
    repository: UniversalRepository<CreateIpLocationDto, UpdateIpLocationDto>,
    queryService: UniversalQueryService,
    permissionService: UniversalPermissionService,
    metricsService: UniversalMetricsService,
    @Optional() @Inject(REQUEST) request: any,
  ) {
    const { model, casl } = IpLocationService.entityConfig;
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
      orderBy: { createdAt: 'desc' },
      includes: {
        location: {
          select: {
            id: true,
            name: true,
            code: true,
            city: true,
            referenceKm: true,
            regional: {
              select: {
                id: true,
                cgr: true,
                color: true,
              },
            },
          },
        },
      },
      transform: {
        flatten: {},
        exclude: ['companyId', 'locationId'],
      },
    };
  }

  async buscarMuitosPorLocalidadeAtiva(locationId: string): Promise<{
    data: unknown[];
  }> {
    const companyId = this.obterUsuarioLogado()?.companyId;

    const location = await this.repository.buscarPrimeiro('location', {
      id: locationId,
      status: 'ACTIVE',
      deletedAt: null,
      ...(companyId && { companyId }),
    });

    if (!location) {
      return { data: [] };
    }

    const result = await this.buscarMuitosPorCampo('locationId', locationId);
    const list = Array.isArray(result.data) ? result.data : [];
    return { data: list };
  }
}
