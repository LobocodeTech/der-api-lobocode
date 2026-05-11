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
import { CreateRegionalsDto } from './dto/create-regionals.dto';
import { UpdateRegionalsDto } from './dto/update-regionals.dto';

@Injectable({ scope: Scope.REQUEST })
export class RegionalsService extends UniversalService<
  CreateRegionalsDto,
  UpdateRegionalsDto
> {
  private static readonly entityConfig = createEntityConfig('regional');

  constructor(
    repository: UniversalRepository<CreateRegionalsDto, UpdateRegionalsDto>,
    queryService: UniversalQueryService,
    permissionService: UniversalPermissionService,
    metricsService: UniversalMetricsService,
    @Optional() @Inject(REQUEST) request: any,
  ) {
    const { model, casl } = RegionalsService.entityConfig;
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
      includes: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      transform: {
        flatten: {},
        exclude: ['companyId'],
      },
      orderBy: { cgr: 'asc' },
    };
  }

}

