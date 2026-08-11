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
  ListagemFiltros,
} from '../../shared/universal';
import { AssetType } from '@prisma/client';
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

  protected construirFiltrosDeListagem(
    filtros: ListagemFiltros,
  ): Record<string, unknown> {
    const extra = super.construirFiltrosDeListagem(filtros);
    const search = filtros.search?.trim();
    if (search) {
      extra.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { referenceKm: { contains: search, mode: 'insensitive' } },
        { regional: { cgr: { contains: search, mode: 'insensitive' } } },
        { regional: { city: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (filtros.regionalId && filtros.regionalId !== 'all') {
      extra.regionalId = filtros.regionalId;
    }
    return extra;
  }

  protected resolverOrderByListagem(
    filtros: ListagemFiltros,
  ): Record<string, 'asc' | 'desc'> | undefined {
    switch (filtros.orderBy) {
      case 'created-oldest':
        return { createdAt: 'asc' };
      case 'name-az':
        return { name: 'asc' };
      case 'updated-newest':
        return { updatedAt: 'desc' };
      case 'created-newest':
        return { createdAt: 'desc' };
      default:
        return undefined;
    }
  }

  protected obterCountsDeListagem(whereClause: Record<string, unknown>) {
    return this.contarStatusAtivoInativo(whereClause);
  }

  async buscarComPaginacao(
    page = 1,
    limit = 20,
    include?: unknown,
    filtros: ListagemFiltros = {},
  ) {
    const includeComAssets = include ?? {
      ...(this.getIncludeConfig() ?? {}),
      assets: {
        where: { deletedAt: null },
        select: { type: true },
      },
    };
    return super.buscarComPaginacao(page, limit, includeComAssets, filtros);
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
        exclude: ['companyId', 'regionalId', 'assets'],
        custom: (entity: Record<string, unknown>) => {
          if (!Array.isArray(entity.assets)) return entity;
          const assets = entity.assets as Array<{ type?: string }>;
          const assetCounts = {
            camera: 0,
            atdb: 0,
            pmv: 0,
            total: assets.length,
          };
          for (const asset of assets) {
            if (asset.type === AssetType.CAMERA) assetCounts.camera += 1;
            else if (asset.type === AssetType.ATDB) assetCounts.atdb += 1;
            else if (asset.type === AssetType.PMV) assetCounts.pmv += 1;
          }
          return { ...entity, assetCounts };
        },
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

