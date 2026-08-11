import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import {
  UniversalMetricsService,
  UniversalPermissionService,
  UniversalQueryService,
  UniversalRepository,
  UniversalService,
  createEntityConfig,
  ListagemFiltros,
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
    @Inject(PrismaService) private readonly prisma: PrismaService,
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

  protected construirFiltrosDeListagem(
    filtros: ListagemFiltros,
  ): Record<string, unknown> {
    const extra = super.construirFiltrosDeListagem(filtros);
    if (filtros.locationId && filtros.locationId !== 'all') {
      extra.locationId = filtros.locationId;
    }
    const search = filtros.search?.trim();
    if (search) {
      extra.OR = [
        { ip: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    return extra;
  }

  async buscarAgrupado(filtros: {
    page?: number;
    limit?: number;
    ipPage?: number;
    ipLimit?: number;
    search?: string;
  }) {
    this.permissionService.validarAction(this.entityNameCasl, 'read');
    const page = Math.max(1, Number(filtros.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(filtros.limit) || 6));
    const ipPage = Math.max(1, Number(filtros.ipPage) || 1);
    const ipLimit = Math.min(50, Math.max(1, Number(filtros.ipLimit) || 12));
    const search = filtros.search?.trim().toLowerCase() ?? '';
    const companyId = this.obterCompanyId();

    const locationWhere: Record<string, unknown> = {
      deletedAt: null,
      status: 'ACTIVE',
      ...(companyId ? { companyId } : {}),
    };

    const locations = (await this.repository.buscarMuitos(
      'location',
      locationWhere,
      { orderBy: { name: 'asc' } },
      {
        regional: {
          select: { id: true, cgr: true, city: true, color: true },
        },
      },
    )) as Array<{
      id: string;
      name: string;
      code: string;
      city: string;
      referenceKm: string | null;
      status: string;
      regional?: {
        id: string;
        cgr: string;
        city?: string;
        color?: string | null;
      } | null;
    }>;

    const ipWhere = {
      deletedAt: null,
      ...(companyId ? { companyId } : {}),
    };
    const ipCounts = await this.prisma.ipLocation.groupBy({
      by: ['locationId'],
      where: ipWhere,
      _count: { _all: true },
    });
    const countByLocation = new Map(
      ipCounts.map((row) => [row.locationId, row._count._all]),
    );

    const matchingIpLocationIds = search
      ? new Set(
          (
            (await this.repository.buscarMuitos(
              this.entityName,
              {
                ...ipWhere,
                OR: [
                  { ip: { contains: search, mode: 'insensitive' } },
                  { description: { contains: search, mode: 'insensitive' } },
                ],
              },
              { orderBy: { sortOrder: 'asc' } },
            )) as Array<{ locationId: string }>
          ).map((row) => row.locationId),
        )
      : null;

    const filtered = locations
      .map((location) => ({
        location,
        ipCount: countByLocation.get(location.id) ?? 0,
      }))
      .filter((row) => {
        if (!search) return true;
        const locationMatches = `${row.location.name} ${row.location.code} ${row.location.city} ${row.location.referenceKm ?? ''}`
          .toLowerCase()
          .includes(search);
        return row.ipCount > 0
          ? locationMatches || (matchingIpLocationIds?.has(row.location.id) ?? false)
          : locationMatches;
      })
      .sort((a, b) => {
        if (b.ipCount !== a.ipCount) return b.ipCount - a.ipCount;
        return a.location.name.localeCompare(b.location.name, 'pt-BR');
      });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
    const pageItems = filtered.slice((page - 1) * limit, page * limit);

    const groups = await Promise.all(
      pageItems.map(async ({ location, ipCount }) => {
        const label = `${location.name} ${location.code} ${location.city} ${location.referenceKm ?? ''}`.toLowerCase();
        const locationMatches = !search || label.includes(search);
        const ipListWhere = {
          ...ipWhere,
          locationId: location.id,
          ...(!locationMatches && search
            ? {
                OR: [
                  { ip: { contains: search, mode: 'insensitive' } },
                  { description: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        };
        const [ips, ipTotal] = await Promise.all([
          this.repository.buscarMuitos(
            this.entityName,
            ipListWhere,
            {
              skip: (ipPage - 1) * ipLimit,
              take: ipLimit,
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
            this.getIncludeConfig(),
          ),
          this.repository.contarTodos(this.entityName, ipListWhere),
        ]);
        const ipTotalPages = Math.max(1, Math.ceil(ipTotal / ipLimit) || 1);
        return {
          location,
          ips: this.transformData(ips),
          ipPagination: {
            page: ipPage,
            limit: ipLimit,
            total: ipTotal,
            totalPages: ipTotalPages,
          },
          ipCount,
        };
      }),
    );

    const totalIps = search
      ? await this.repository.contarTodos(this.entityName, {
          ...ipWhere,
          OR: [
            { ip: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            {
              location: {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { code: { contains: search, mode: 'insensitive' } },
                  { city: { contains: search, mode: 'insensitive' } },
                ],
              },
            },
          ],
        })
      : await this.repository.contarTodos(this.entityName, ipWhere);

    return {
      data: groups,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      counts: {
        total: totalIps,
        active: totalIps,
        inactive: 0,
      },
    };
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
