import { Prisma, Roles, User } from '@prisma/client';
import { EntityNameCasl } from '../universal/types';

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
      if (!user.regionalId) {
        return construirWhereImpossivel();
      }
      return { regionalId: user.regionalId };

    case 'Asset':
      if (!user.regionalId) {
        return construirWhereImpossivel();
      }
      return { location: { regionalId: user.regionalId } };

    case 'WorkOrder':
      return construirClausulaOsVisivelParaUsuario(user);

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
