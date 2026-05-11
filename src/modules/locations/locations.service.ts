import { Inject, Injectable, Optional, Scope } from '@nestjs/common';
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
}

