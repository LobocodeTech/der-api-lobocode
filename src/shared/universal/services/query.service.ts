import { Injectable, Scope, Inject, Optional } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { CaslAbilityService } from '../../casl/casl-ability/casl-ability.service';
import { TenantService } from '../../tenant/tenant.service';
import { accessibleBy } from '@casl/prisma';
import { CrudAction } from '../../common/types';
import { EntityNameCasl } from '../types';
import { ForbiddenError } from '../../common/errors';
import { ERROR_MESSAGES } from 'src/shared/common/messages';
import {
  construirClausulaAndEscopoRegional,
  deveIgnorarEscopoRegionalNaLeituraDaEntidade,
} from '../../regional-scope/regional-scope.helper';

/** Entidades que não possuem companyId no schema (ex.: sub-módulos de Employee). */
const ENTITIES_WITHOUT_COMPANY: EntityNameCasl[] = [];

/** Remove companyId do where (e de AND aninhados) para não enviar ao Prisma em entidades sem esse campo. */
function stripCompanyIdFromWhere(where: any): void {
  if (!where || typeof where !== 'object') return;
  delete where.companyId;
  if (Array.isArray(where.AND)) {
    where.AND.forEach((clause: any) => stripCompanyIdFromWhere(clause));
  }
  if (Array.isArray(where.OR)) {
    where.OR.forEach((clause: any) => stripCompanyIdFromWhere(clause));
  }
  if (where.NOT && typeof where.NOT === 'object') {
    stripCompanyIdFromWhere(where.NOT);
  }
}

@Injectable({ scope: Scope.REQUEST })
export class UniversalQueryService {
  constructor(
    private abilityService: CaslAbilityService,
    private tenantService: TenantService,
    @Optional() @Inject(REQUEST) private readonly request?: Request,
  ) {}

  // ============================================================================
  // 📋 MÉTODOS PÚBLICOS - CONSTRUÇÃO DE WHERE CLAUSE
  // ============================================================================

  /**
   * Constrói where clause para operações de leitura
   */
  construirWhereClauseParaRead(
    entityName: EntityNameCasl,
    baseWhere: any = {},
  ): any {
    return this.construirWhereClauseBase(entityName, 'read', baseWhere);
  }

  /**
   * Constrói where clause para operações de atualização
   */
  construirWhereClauseParaUpdate(entityName: EntityNameCasl, id: string): any {
    return this.construirWhereClauseBase(entityName, 'update', { id });
  }

  /**
   * Constrói where clause para operações de criação
   */
  construirWhereClauseParaCreate(entityName: EntityNameCasl): any {
    return this.construirWhereClauseBase(entityName, 'create');
  }

  /**
   * Constrói where clause para operações de exclusão
   */
  construirWhereClauseParaDelete(entityName: EntityNameCasl, id: string): any {
    return this.construirWhereClauseBase(entityName, 'delete', { id });
  }

  // ============================================================================
  // 🔧 MÉTODOS PRIVADOS - LÓGICA CENTRALIZADA
  // ============================================================================

  /**
   * Constrói where clause baseado na ação e filtros adicionais
   * Centraliza a lógica de construção de filtros Prisma com regras CASL
   */

  /**
   * Lista de entidades que NÃO têm soft delete (deletedAt)
   */
  private readonly entitiesWithoutSoftDelete: EntityNameCasl[] = [];

  private construirWhereClauseBase(
    entityName: EntityNameCasl,
    action: CrudAction,
    additionalWhere: any = {},
  ): any {
    const ability = this.abilityService.ability;
    
    const tenant = this.tenantService.getTenant();

    try {
      const whereClause: any = {
        ...additionalWhere,
        AND: [accessibleBy(ability, action)[entityName]],
      };

      const usuario = this.abilityService.obterUsuarioAtivo();
      if (usuario) {
        const ignorarEscopoRegional =
          action === 'read' &&
          deveIgnorarEscopoRegionalNaLeituraDaEntidade(
            entityName,
            usuario,
            this.request as Record<string, unknown> | undefined,
          );

        if (!ignorarEscopoRegional) {
          const escopoRegional = construirClausulaAndEscopoRegional(
            entityName,
            usuario,
          );
          if (escopoRegional) {
            whereClause.AND.push(escopoRegional);
          }
        }
      }

      // Só adiciona deletedAt se a entidade tiver soft delete
      if (!this.entitiesWithoutSoftDelete.includes(entityName)) {
        whereClause.deletedAt = null;
      }

      // Se não for tenant global e a entidade tiver companyId, filtra por companyId
      if (!tenant.isGlobal && !ENTITIES_WITHOUT_COMPANY.includes(entityName)) {
        whereClause.companyId = tenant.id;
      }

      // Regras CASL com 'all' podem injetar companyId; remover em entidades que não têm o campo
      if (ENTITIES_WITHOUT_COMPANY.includes(entityName)) {
        stripCompanyIdFromWhere(whereClause);
      }

      return whereClause;
    } catch (error) {
      const err = error as { name?: string };
      // Capturar ForbiddenError do CASL e relançar como erro mais específico
      if (err.name === 'ForbiddenError') {
        throw new ForbiddenError(
          ERROR_MESSAGES.AUTHORIZATION.RESOURCE_ACCESS_DENIED,
        );
      }
      // Re-throw outros erros
      throw error;
    }
  }
}
