import { Inject, Injectable, Optional, Scope } from '@nestjs/common';
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
import { CreateRegionalsDto } from './dto/create-regionals.dto';
import { UpdateRegionalsDto } from './dto/update-regionals.dto';
import { ConflictError } from '../../shared/common/errors';

/**
 * Chave canônica do CGR para unicidade: trim, Unicode NFKC (compatível entre NFC/NFD),
 * minúsculas (comparação **case-insensitive**) e espaços internos normalizados.
 */
function normalizarChaveUnicidadeCgr(cgr: string): string {
  return cgr
    .trim()
    .normalize('NFKC')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ');
}

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

  protected construirFiltrosDeListagem(
    filtros: ListagemFiltros,
  ): Record<string, unknown> {
    const extra = super.construirFiltrosDeListagem(filtros);
    const search = filtros.search?.trim();
    if (search) {
      extra.OR = [
        { cgr: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (filtros.city && filtros.city !== 'all') {
      extra.city = filtros.city;
    }
    return extra;
  }

  protected obterCountsDeListagem(whereClause: Record<string, unknown>) {
    return this.contarStatusAtivoInativo(whereClause);
  }

  /**
   * Detecta regional cuja chave de unicidade do CGR coincide com `cgrInformado`
   * (comparação **insensitive** a maiúsculas/minúsculas + normalização Unicode).
   * @param excluirRegionalId — ao editar, ignora o próprio registro.
   */
  private async encontrarRegionalComCgrSemanticaDuplicada(
    cgrInformado: string,
    excluirRegionalId?: string,
  ): Promise<{ id: string; cgr: string } | null> {
    const companyId = this.obterCompanyId();
    const chave = normalizarChaveUnicidadeCgr(cgrInformado);

    const where: Record<string, unknown> = { deletedAt: null };
    if (companyId) {
      where.companyId = companyId;
    }

    const lista = (await this.repository.buscarMuitos(
      this.entityName,
      where,
    )) as Array<{ id: string; cgr: string }>;

    const duplicata = lista.find((regional) => {
      if (excluirRegionalId && regional.id === excluirRegionalId) {
        return false;
      }
      return normalizarChaveUnicidadeCgr(regional.cgr) === chave;
    });

    return duplicata ?? null;
  }

  protected async antesDeCriar(data: CreateRegionalsDto): Promise<void> {
    const existingRegional = await this.encontrarRegionalComCgrSemanticaDuplicada(
      data.cgr,
    );

    if (existingRegional) {
      throw new ConflictError('CGR já está em uso por outra regional');
    }
  }

  protected async antesDeAtualizar(
    id: string,
    data: UpdateRegionalsDto,
  ): Promise<void> {
    if (data.cgr === undefined) {
      return;
    }

    const existingRegional = await this.encontrarRegionalComCgrSemanticaDuplicada(
      data.cgr,
      id,
    );

    if (existingRegional) {
      throw new ConflictError('CGR já está em uso por outra regional');
    }
  }
}
