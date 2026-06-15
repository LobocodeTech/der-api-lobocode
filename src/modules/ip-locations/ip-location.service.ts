import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
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
      orderBy: { sortOrder: 'asc' },
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

  protected async antesDeCriar(data: CreateIpLocationDto): Promise<void> {
    const locationId = data.locationId?.trim();
    if (!locationId) {
      throw new BadRequestException('Informe a localidade do IP.');
    }

    const companyId = this.obterCompanyId();
    const location = await this.repository.buscarPrimeiro('location', {
      id: locationId,
      status: 'ACTIVE',
      deletedAt: null,
      ...(companyId && { companyId }),
    });

    if (!location) {
      throw new BadRequestException('Localidade não encontrada ou inativa.');
    }

    const existingIps = await this.repository.buscarMuitos(
      this.entityName,
      {
        locationId,
        deletedAt: null,
        ...(companyId && { companyId }),
      },
      { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    );

    const maxSortOrder = existingIps.reduce((max, ip) => {
      const value =
        typeof ip.sortOrder === 'number' && Number.isFinite(ip.sortOrder)
          ? ip.sortOrder
          : 0;
      return Math.max(max, value);
    }, 0);

    (data as CreateIpLocationDto & { sortOrder?: number }).sortOrder =
      maxSortOrder + 1;
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

    const ips = await this.repository.buscarMuitos(
      this.entityName,
      {
        locationId,
        deletedAt: null,
        ...(companyId && { companyId }),
      },
      { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    );

    return { data: ips };
  }

  async reordenarPorLocalidade(locationId: string, orderedIds: string[]) {
    const normalizedLocationId = locationId?.trim();
    if (!normalizedLocationId) {
      throw new BadRequestException('Informe a localidade para reordenação.');
    }

    const companyId = this.obterCompanyId();
    if (!companyId) {
      throw new BadRequestException('Empresa do usuário não encontrada.');
    }

    const location = await this.repository.buscarPrimeiro('location', {
      id: normalizedLocationId,
      status: 'ACTIVE',
      deletedAt: null,
      companyId,
    });

    if (!location) {
      throw new BadRequestException('Localidade não encontrada ou inativa.');
    }

    const uniqueOrderedIds = Array.from(
      new Set(orderedIds.map((id) => id?.trim()).filter(Boolean)),
    );
    if (uniqueOrderedIds.length === 0) {
      throw new BadRequestException('Informe ao menos um IP para reordenação.');
    }

    const ips = await this.repository.buscarMuitos(
      this.entityName,
      {
        locationId: normalizedLocationId,
        deletedAt: null,
        companyId,
      },
      { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    );

    const byId = new Map(ips.map((ip) => [String(ip.id), ip]));
    const allProvidedExist = uniqueOrderedIds.every((id) => byId.has(id));
    if (!allProvidedExist) {
      throw new BadRequestException(
        'Um ou mais IPs informados não existem para esta localidade.',
      );
    }

    const providedSet = new Set(uniqueOrderedIds);
    const tailIds = ips
      .map((ip) => String(ip.id))
      .filter((id) => !providedSet.has(id));
    const finalOrderIds = [...uniqueOrderedIds, ...tailIds];

    await Promise.all(
      finalOrderIds.map((id, index) =>
        this.repository.atualizar(
          this.entityName,
          { id },
          { sortOrder: index + 1 } as UpdateIpLocationDto,
        ),
      ),
    );

    return { message: 'Ordem dos IPs atualizada com sucesso.' };
  }
}
