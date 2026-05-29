import { Injectable, Scope } from '@nestjs/common';
import { CaslAbilityService } from '../../../shared/casl/casl-ability/casl-ability.service';
import { TenantService } from '../../../shared/tenant/tenant.service';
import { accessibleBy } from '@casl/prisma';
import { Prisma } from '@prisma/client';
import { CrudAction } from '../../../shared/common/types';
import { construirClausulaAndEscopoRegional } from '../../../shared/regional-scope/regional-scope.helper';

export type UserSoftDeleteScope = 'active' | 'deleted';

@Injectable({ scope: Scope.REQUEST })
export class UserQueryService {
  constructor(
    private abilityService: CaslAbilityService,
    private tenantService: TenantService,
  ) {}

  // ============================================================================
  // 📋 MÉTODOS PÚBLICOS - CONSTRUÇÃO DE WHERE CLAUSE
  // ============================================================================

  /**
   * Constrói where clause para operações de leitura
   */
  construirWhereClauseParaRead(
    baseWhere: Prisma.UserWhereInput = {},
    scope: UserSoftDeleteScope = 'active',
  ): Prisma.UserWhereInput {
    return this.construirWhereClauseBase('read', baseWhere, scope);
  }

  construirWhereClauseParaReadDeletados(
    baseWhere: Prisma.UserWhereInput = {},
  ): Prisma.UserWhereInput {
    return this.construirWhereClauseParaRead(baseWhere, 'deleted');
  }

  /**
   * Constrói where clause para operações de atualização
   */
  construirWhereClauseParaUpdate(id: string): Prisma.UserWhereInput {
    return this.construirWhereClauseBase('update', { id });
  }

  /**
   * Constrói where clause para operações de criação
   */
  construirWhereClauseParaCreate(): Prisma.UserWhereInput {
    return this.construirWhereClauseBase('create');
  }

  /**
   * Constrói where clause para operações de exclusão
   */
  construirWhereClauseParaDelete(id: string): Prisma.UserWhereInput {
    return this.construirWhereClauseBase('delete', { id });
  }

  // ============================================================================
  // 🔧 MÉTODOS PRIVADOS - LÓGICA CENTRALIZADA
  // ============================================================================

  /**
   * Constrói where clause baseado na ação e filtros adicionais
   * Centraliza a lógica de construção de filtros Prisma com regras CASL
   */

  private construirWhereClauseBase(
    action: CrudAction,
    additionalWhere: Prisma.UserWhereInput = {},
    scope: UserSoftDeleteScope = 'active',
  ): Prisma.UserWhereInput {
    const ability = this.abilityService.ability;
    const tenant = this.tenantService.getTenant();

    const andParts: Prisma.UserWhereInput[] = [accessibleBy(ability, action).User];
    const usuario = this.abilityService.obterUsuarioAtivo();
    const escopoRegional = construirClausulaAndEscopoRegional('User', usuario);
    if (escopoRegional) {
      andParts.push(escopoRegional as Prisma.UserWhereInput);
    }

    const deletedAtFilter: Prisma.UserWhereInput['deletedAt'] =
      scope === 'deleted' ? { not: null } : null;

    const whereClause: Prisma.UserWhereInput = {
      ...additionalWhere,
      AND: andParts,
      deletedAt: deletedAtFilter,
    };

    // Se não for tenant global, filtra por companyId
    if (!tenant.isGlobal) {
      whereClause.companyId = tenant.id;
    }

    return whereClause;
  }


}
