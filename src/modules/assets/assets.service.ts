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
} from 'src/shared/universal';
import { aplicarCamposAssetPorTipo } from './asset-field.util';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

@Injectable({ scope: Scope.REQUEST })
export class AssetsService extends UniversalService<
  CreateAssetDto,
  UpdateAssetDto
> {
  private static readonly entityConfig = createEntityConfig('asset');

  constructor(
    repository: UniversalRepository<CreateAssetDto, UpdateAssetDto>,
    queryService: UniversalQueryService,
    permissionService: UniversalPermissionService,
    metricsService: UniversalMetricsService,
    @Optional() @Inject(REQUEST) request: any,
  ) {
    const { model, casl } = AssetsService.entityConfig;
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

  protected async antesDeCriar(data: CreateAssetDto): Promise<void> {
    if (!data.type) {
      throw new BadRequestException('Tipo do equipamento é obrigatório.');
    }
    aplicarCamposAssetPorTipo(data);
  }

  protected async antesDeAtualizar(
    id: string,
    data: UpdateAssetDto,
  ): Promise<void> {
    if (!data.type) {
      const existente = await this.repository.buscarPrimeiro('asset', {
        id,
        deletedAt: null,
      });
      if (!existente) return;
      (data as CreateAssetDto).type = (existente as { type: CreateAssetDto['type'] })
        .type;
    }
    if (data.type) {
      aplicarCamposAssetPorTipo(data as CreateAssetDto);
    }
  }

  setEntityConfig() {
    const companyId = this.obterUsuarioLogado()?.companyId;

    this.entityConfig = {
      ...this.entityConfig,
      includes: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      where: {
        deletedAt: null,
        ...(companyId && { companyId }),
      },
      orderBy: { createdAt: 'desc' },
    };
  }

  /**
   * Lista ativos (câmeras etc.) vinculados ao nome da localidade,
   * garantindo que a localidade esteja ACTIVE e NÃO deletada (soft delete).
   *
   */
  async buscarMuitosPorRodoviaAtiva(locationId: string): Promise<{
    data: any[];
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
    return {
      data: list.filter((a: { locationId?: string }) => a.locationId === locationId),
    };
  }

  /**
   * Lista todos os assets, mas apenas os que estão vinculados a rodovias ACTIVE
   * e não deletadas.
   *
   * Observacao:
   * - `Asset.location` eh apenas uma String (sem relacao Prisma).
   * - Por isso, a filtragem por status da rodovia precisa ser feita manualmente.
   */
  async buscarTodos(): Promise<any[]> {
    const assets = await super.buscarTodos();

    const companyId = this.obterUsuarioLogado()?.companyId;
    const activelocations = await this.repository.buscarMuitos('location', {
      status: 'ACTIVE',
      deletedAt: null,
      ...(companyId && { companyId }),
    });

    const activelocationsIds = new Set(
      activelocations.map((h: any) => h.id),
    );

    return assets.filter((a: any) => activelocationsIds.has(a.locationId));
  }
}

