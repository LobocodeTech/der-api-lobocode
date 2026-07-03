import { Prisma, Roles, User } from '@prisma/client';
import { EntityNameCasl } from '../universal/types';

export const OPERATIONAL_MAP_SCOPE_KEY = 'operationalMapScope';

export function isOperationalMapQuery(
  query: Record<string, unknown> | undefined,
): boolean {
  if (!query) return false;
  const raw = query.operationalMap ?? query.operationalMapScope;
  if (raw === true) return true;
  if (typeof raw === 'string') {
    return raw === 'true' || raw === '1';
  }
  return false;
}

export function deveIgnorarEscopoRegionalNaLeitura(
  user: Pick<User, 'role'>,
  request?: Record<string, unknown>,
): boolean {
  return (
    user.role === Roles.FIELD_TEAM &&
    request?.[OPERATIONAL_MAP_SCOPE_KEY] === true
  );
}

const ENTIDADES_ESCOPO_MAPA_OPERACIONAL: EntityNameCasl[] = [
  'Regional',
  'Location',
  'Asset',
  'WorkOrder',
];

/** FIELD_TEAM: leitura de cadastro operacional em toda a empresa (somente consulta). */
const ENTIDADES_LEITURA_EMPRESA_FIELD_TEAM: EntityNameCasl[] = [
  'Location',
  'Asset',
  'IpLocation',
];

export function fieldTeamLeituraCadastroOperacionalEmpresa(
  entityName: EntityNameCasl,
  user: Pick<User, 'role'>,
): boolean {
  return (
    user.role === Roles.FIELD_TEAM &&
    ENTIDADES_LEITURA_EMPRESA_FIELD_TEAM.includes(entityName)
  );
}

export function deveIgnorarEscopoRegionalNaLeituraDaEntidade(
  entityName: EntityNameCasl,
  user: Pick<User, 'role'>,
  request?: Record<string, unknown>,
): boolean {
  if (fieldTeamLeituraCadastroOperacionalEmpresa(entityName, user)) {
    return true;
  }
  if (!deveIgnorarEscopoRegionalNaLeitura(user, request)) {
    return false;
  }
  return ENTIDADES_ESCOPO_MAPA_OPERACIONAL.includes(entityName);
}

/**
 * OS visível para o usuário: regional do usuário ou fila da OS na qual ele está.
 * Mesma regra usada em `aplicarRestricoesRegionaisNaoAdmin` (CASL) e notificações de OS.
 */
export function construirClausulaOsVisivelParaUsuario(
  user: Pick<User, 'id' | 'regionalId'>,
): Prisma.WorkOrderWhereInput {
  const membroDeFilaNaOs: Prisma.WorkOrderWhereInput = {
    workOrderQueues: {
      some: {
        queue: {
          queueUsers: { some: { userId: user.id } },
        },
      },
    },
  };

  if (user.regionalId) {
    return {
      OR: [{ location: { regionalId: user.regionalId } }, membroDeFilaNaOs],
    };
  }

  return membroDeFilaNaOs;
}

/**
 * Planejamento visível para o usuário: regional do usuário ou responsável associado.
 * Mesma regra usada em `aplicarRestricoesRegionaisNaoAdmin` (CASL) e queries universais.
 */
export function construirClausulaPlanningVisivelParaUsuario(
  user: Pick<User, 'id' | 'regionalId'>,
): Prisma.PlanningWhereInput {
  const responsavelAssociado: Prisma.PlanningWhereInput = {
    responsibles: { some: { userId: user.id } },
  };

  if (user.regionalId) {
    return {
      OR: [{ location: { regionalId: user.regionalId } }, responsavelAssociado],
    };
  }

  return responsavelAssociado;
}

/** Cláusula Prisma que não casa com nenhum registro (`WHERE id IN ()`). */
export function construirWhereImpossivel(): { id: { in: [] } } {
  return { id: { in: [] } };
}

export function isUsuarioAdministradorEmpresaOuSistema(user: User): boolean {
  return (
    user.role === Roles.SYSTEM_ADMIN ||
    user.role === Roles.ADMIN ||
    user.role === Roles.C2C
  );
}

/**
 * Filtro Prisma adicional (AND) alinhado às restrições regionais para não-admins.
 * Retorna null quando não há filtro extra (admin ou entidade fora do escopo regional).
 */
export function construirClausulaAndEscopoRegional(
  entityName: EntityNameCasl,
  user: User,
): Record<string, unknown> | null {
  if (isUsuarioAdministradorEmpresaOuSistema(user)) {
    return null;
  }

  switch (entityName) {
    case 'Regional':
      if (!user.regionalId) {
        return construirWhereImpossivel();
      }
      return { id: user.regionalId };

    case 'Location':
      if (user.role === Roles.FIELD_TEAM) {
        return null;
      }
      if (!user.regionalId) {
        return construirWhereImpossivel();
      }
      return { regionalId: user.regionalId };

    case 'Asset':
      if (user.role === Roles.FIELD_TEAM) {
        return null;
      }
      if (!user.regionalId) {
        return construirWhereImpossivel();
      }
      return { location: { regionalId: user.regionalId } };

    case 'WorkOrder':
      return construirClausulaOsVisivelParaUsuario(user);

    case 'Planning':
      return construirClausulaPlanningVisivelParaUsuario(user);

    case 'User':
      if (!user.regionalId) {
        return { id: user.id };
      }
      return {
        OR: [{ id: user.id }, { regionalId: user.regionalId }],
      };

    default:
      return null;
  }
}
