import { Injectable, Scope, Inject, Optional } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { AbilityBuilder, PureAbility } from '@casl/ability';
import { createPrismaAbility, PrismaQuery, Subjects } from '@casl/prisma';
import {
  Prisma,
  QueueStatus,
  Roles,
  User,
  UserStatus,
  WorkOrderType,
} from '@prisma/client';
import {
  construirClausulaOsVisivelParaUsuario,
  isUsuarioAdministradorEmpresaOuSistema,
  deveIgnorarEscopoRegionalNaLeitura,
} from '../../regional-scope/regional-scope.helper';

export type PermActions =
  | 'manage'
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'cancel'
  | 'approve'
  | 'export';

// Recursos alinhados ao schema DEPARTAMENTO ESTADUAL DE RODOVIAS (sem Post, Shift, Patrol, etc.)
export type PermissionResource =
  | Subjects<{
      User: User;
      Document: any;
      Company: any;
      Client: any;
      File: any;
      Notification: any;
      Regional: any;
      Location: any;
      Asset: any;
      WorkOrder: any;
      WorkOrderColumn: any;
      WorkOrderChecklistItem: any;
      Planning: any;
      Queue: any;
      QueueUser: any;
      WorkOrderQueue: any;
      PlanningResponsible: any;
      IpLocation: any;
    }>
  | 'all';

export type AppAbility = PureAbility<
  [PermActions, PermissionResource],
  PrismaQuery
>;

export type DefinePermissions = (
  user: User,
  builder: AbilityBuilder<AppAbility>,
) => void;

// ========================================
// PERMISSÕES CENTRALIZADAS
// ========================================

// Permissões básicas de perfil
const profilePermissions = {
  ownProfile: (user: User, { can }: any) => {
    can('read', 'User', { companyId: user.companyId });
    can('update', 'User', ['name', 'email', 'login', 'phone', 'profilePicture'], { id: user.id });
  },

  ownProfileExtended: (user: User, { can }: any) => {
    can('read', 'User', { id: user.id });
    can('update', 'User', ['name', 'email', 'login', 'phone', 'profilePicture'], { id: user.id });
  },
};

const basicViewPermissions = {
  readNonAdminUsers: (user: User, { cannot }: any) => {
    cannot('read', 'User', {
      companyId: user.companyId,
      role: { in: [Roles.ADMIN, Roles.SYSTEM_ADMIN] },
    });
  },
};

// Permissões de recursos básicos (schema DEPARTAMENTO ESTADUAL DE RODOVIAS - sem Post/Vehicle)
const basicResourcePermissions = {
  readDocuments: (user: User, { can }: any) => {
    can('read', 'Document', { companyId: user.companyId });
  },
};

// Permissões operacionais (schema DEPARTAMENTO ESTADUAL DE RODOVIAS - Client, etc.)
const operationalPermissions = {
  clientManagement: (user: User, { can }: any) => {
    can('manage', 'Client', { companyId: user.companyId });
  },
};

// Permissões administrativas
const administrativePermissions = {
  companyRead: (user: User, { can }: any) => {
    can('read', 'all', { companyId: user.companyId });
  },

  companyManage: (user: User, { can }: any) => {
    can(['create', 'update', 'delete'], 'all', { companyId: user.companyId });
  },

  userManagement: (user: User, { can }: any, allowedRoles: Roles[]) => {
    can(['create', 'update', 'delete'], 'User', {
      companyId: user.companyId,
      role: { in: allowedRoles },
    });

  },

  resourceManagement: (user: User, { can }: any) => {
    can('manage', 'Document', { companyId: user.companyId });
    can('manage', 'Client', { companyId: user.companyId });
  },

  reporting: (user: User, { can }: any) => {
    can('read', 'Document', { companyId: user.companyId });
  },
};

// Permissões específicas (schema DEPARTAMENTO ESTADUAL DE RODOVIAS)
const specificPermissions = {
  notifications: (user: User, { can }: any) => {
    can('read', 'Notification', { companyId: user.companyId });
    can('manage', 'Notification', { companyId: user.companyId });
  },
  /** FIELD_TEAM: leitura/gestão na empresa; escopo de OS é aplicado no serviço de notificações. */
  notificationsFieldTeam: (user: User, { can }: any) => {
    can('read', 'Notification', { companyId: user.companyId });
    can(['update', 'delete'], 'Notification', { companyId: user.companyId });
  },
  workOrdersRead: (user: User, { can }: any) => {
    can('read', 'WorkOrder', { companyId: user.companyId });
  },
  workOrdersManage: (user: User, { can }: any) => {
    can(['create', 'read', 'update', 'delete'], 'WorkOrder', {
      companyId: user.companyId,
    });
  },
  workOrderColumnsManage: (user: User, { can }: any) => {
    can(['read'], 'WorkOrderColumn', {
      companyId: user.companyId,
    });
  },
  planningManage: (user: User, { can }: any) => {
    can(['read'], 'Planning', {
      companyId: user.companyId,
    });
  },
  queuesManage: (user: User, { can }: any) => {
    can('manage', 'Queue', { companyId: user.companyId });
  },
  /** Listagem/leitura de filas (ex.: picker em OS) — sem criar/editar/excluir filas. */
  queuesRead: (user: User, { can }: any) => {
    can('read', 'Queue', { companyId: user.companyId });
  },
  ipLocationsManage: (user: User, { can }: any) => {
    can('manage', 'IpLocation', { companyId: user.companyId });
  },
  ipLocationsRead: (user: User, { can }: any) => {
    can('read', 'IpLocation', { companyId: user.companyId });
  },
  ipLocationsC2cMutate: (user: User, { can }: any) => {
    can(['create', 'update'], 'IpLocation', { companyId: user.companyId });
  },
  locationsC2cMutate: (user: User, { can }: any) => {
    can(['create', 'update'], 'Location', { companyId: user.companyId });
  },
};

const operationalReadScopePermissions = {
  assetsLocationsRegionalsRead: (user: User, { can }: any) => {
    can('read', 'Regional', { companyId: user.companyId });
    can('read', 'Location', { companyId: user.companyId });
    can('read', 'Asset', { companyId: user.companyId });
    can('read', 'IpLocation', { companyId: user.companyId });
  },
};

/**
 * C2C e Equipe de Campo não podem acessar gestão de equipe.
 * Mantém leitura/edição apenas do próprio perfil.
 */
function aplicarRestricaoGestaoEquipe(user: User, { cannot }: any) {
  cannot('read', 'User', {
    companyId: user.companyId,
    NOT: { id: user.id },
  });
  cannot('create', 'User', { companyId: user.companyId });
  cannot('update', 'User', {
    companyId: user.companyId,
    NOT: { id: user.id },
  });
  cannot('delete', 'User', {
    companyId: user.companyId,
    NOT: { id: user.id },
  });
}

/**
 * C2C: sem CRUD de usuários alheios, mas com leitura de quem pode ser responsável em OS
 * (alinhado a `UsersService.buscarTodosResponsaveisPorOrdensDeServico`) e à busca global.
 */
function aplicarRestricaoGestaoEquipeC2c(user: User, { can, cannot }: any) {
  cannot('create', 'User', { companyId: user.companyId });
  cannot('update', 'User', {
    companyId: user.companyId,
    NOT: { id: user.id },
  });
  cannot('delete', 'User', {
    companyId: user.companyId,
    NOT: { id: user.id },
  });

  can('read', 'User', {
    companyId: user.companyId,
    deletedAt: null,
    role: { in: [Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C] },
  });
}

// ========================================
// MAPEAMENTO DE ROLES (schema DEPARTAMENTO ESTADUAL DE RODOVIAS: SYSTEM_ADMIN, ADMIN, FISCAL_CAMPO, OPERADOR, INSPETOR_VIA)
// ========================================

/**
 * Restringe leitura e mutação de Regional, Location, Asset, WorkOrder e User (listagens)
 * ao escopo da regional do usuário. Admin / SYSTEM_ADMIN não são alterados.
 *
 * FIELD_TEAM: leitura de Location, Asset e IpLocation em toda a empresa (sem filtro
 * regional), para consultar cadastro operacional em modo somente leitura.
 *
 * Notificações de OS para FIELD_TEAM: o modelo Notification não tem relação Prisma com
 * WorkOrder; o escopo (regional + fila associada) é aplicado em
 * WorkOrderNotificationScopeService e NotificationService.
 */
function aplicarRestricoesRegionaisNaoAdmin(
  user: User,
  { cannot }: any,
  options?: { ignorarEscopoRegionalLeitura?: boolean },
) {
  if (isUsuarioAdministradorEmpresaOuSistema(user)) {
    return;
  }

  const c = user.companyId;
  const ignorarLeitura = options?.ignorarEscopoRegionalLeitura === true;
  const fieldTeamLeituraCadastroEmpresa = user.role === Roles.FIELD_TEAM;

  if (!user.regionalId) {
    if (!ignorarLeitura) {
      cannot('read', 'Regional', { companyId: c });
      if (!fieldTeamLeituraCadastroEmpresa) {
        cannot('read', 'Location', { companyId: c });
        cannot('read', 'Asset', { companyId: c });
        cannot('read', 'IpLocation', { companyId: c });
      }
      cannot('read', 'WorkOrder', { companyId: c });
      cannot('read', 'User', { companyId: c, NOT: { id: user.id } });
    }
    for (const action of ['create', 'update', 'delete'] as const) {
      cannot(action, 'Regional', { companyId: c });
      cannot(action, 'Queue', { companyId: c });
      cannot(action, 'Location', { companyId: c });
      cannot(action, 'Asset', { companyId: c });
      cannot(action, 'IpLocation', { companyId: c });
      cannot(action, 'WorkOrder', { companyId: c });
    }
    if (!ignorarLeitura) {
      for (const action of ['create', 'update', 'delete'] as const) {
        cannot(action, 'User', { companyId: c, NOT: { id: user.id } });
      }
    } else {
      cannot('create', 'User', { companyId: c });
      cannot('update', 'User', {
        companyId: c,
        NOT: { id: user.id },
      });
      cannot('delete', 'User', {
        companyId: c,
        NOT: { id: user.id },
      });
    }
    return;
  }

  const r = user.regionalId;
  const workOrderPermitidoForaRegional =
    construirClausulaOsVisivelParaUsuario(user);

  if (!ignorarLeitura) {
    cannot('read', 'Regional', { companyId: c, NOT: { id: r } });
    if (!fieldTeamLeituraCadastroEmpresa) {
      cannot('read', 'Location', { companyId: c, NOT: { regionalId: r } });
      cannot('read', 'Asset', {
        companyId: c,
        NOT: { location: { regionalId: r } },
      });
      cannot('read', 'IpLocation', {
        companyId: c,
        NOT: { location: { regionalId: r } },
      });
    }
    cannot('read', 'WorkOrder', {
      companyId: c,
      NOT: workOrderPermitidoForaRegional,
    });
    cannot('read', 'User', {
      companyId: c,
      NOT: { OR: [{ id: user.id }, { regionalId: r }] },
    });
  }

  cannot(['create', 'update', 'delete'], 'Queue', { companyId: c });

  for (const action of ['create', 'update', 'delete'] as const) {
    cannot(action, 'Regional', { companyId: c, NOT: { id: r } });
    cannot(action, 'Location', { companyId: c, NOT: { regionalId: r } });
    cannot(action, 'Asset', {
      companyId: c,
      NOT: { location: { regionalId: r } },
    });
    cannot(action, 'IpLocation', {
      companyId: c,
      NOT: { location: { regionalId: r } },
    });
    if (action !== 'create') {
      cannot(action, 'WorkOrder', {
        companyId: c,
        NOT: workOrderPermitidoForaRegional,
      });
    }
  }

  if (!ignorarLeitura) {
    for (const action of ['create', 'update', 'delete'] as const) {
      cannot(action, 'User', {
        companyId: c,
        NOT: { OR: [{ id: user.id }, { regionalId: r }] },
      });
    }
  } else {
    cannot('create', 'User', { companyId: c });
    cannot('update', 'User', {
      companyId: c,
      NOT: { id: user.id },
    });
    cannot('delete', 'User', {
      companyId: c,
      NOT: { id: user.id },
    });
  }
}

/**
 * C2C: todas as regionais da empresa, porém somente ordens de serviço corretivas
 * (leitura e mutação bloqueadas para demais tipos).
 */
function aplicarRestricoesPerfilC2c(user: User, { cannot }: any) {
  const c = user.companyId;
  const foraDoEscopoCorretivo = {
    companyId: c,
    NOT: { type: WorkOrderType.CORRECTIVE },
  };
  cannot(['read', 'update', 'delete'], 'WorkOrder', foraDoEscopoCorretivo);
  cannot('create', 'WorkOrder', foraDoEscopoCorretivo);
}

/**
 * Aplica ocultação em cascata por soft delete na cadeia Mãe -> Filha.
 * Quando a mãe está deletada logicamente, a filha não pode ser lida/alterada.
 */
function aplicarRestricoesSoftDeleteEmCascata({ cannot }: any) {
  cannot(['read', 'update', 'delete'], 'Regional', {
    company: { deletedAt: { not: null } },
  });

  cannot(['read', 'update', 'delete'], 'Location', {
    OR: [
      { company: { deletedAt: { not: null } } },
      { regional: { deletedAt: { not: null } } },
    ],
  });

  cannot(['read', 'update', 'delete'], 'Asset', {
    OR: [
      { company: { deletedAt: { not: null } } },
      { location: { deletedAt: { not: null } } },
      { location: { regional: { deletedAt: { not: null } } } },
    ],
  });

  cannot(['read', 'update', 'delete'], 'WorkOrderColumn', {
    OR: [
      { company: { deletedAt: { not: null } } },
      {
        AND: [
          { regionalId: { not: null } },
          { regional: { deletedAt: { not: null } } },
        ],
      },
    ],
  });

  cannot(['read', 'update', 'delete'], 'Planning', {
    OR: [
      { company: { deletedAt: { not: null } } },
      { location: { deletedAt: { not: null } } },
      { location: { regional: { deletedAt: { not: null } } } },
    ],
  });

  cannot(['read', 'update', 'delete'], 'WorkOrder', {
    OR: [
      { company: { deletedAt: { not: null } } },
      { location: { deletedAt: { not: null } } },
      { location: { regional: { deletedAt: { not: null } } } },
      {
        AND: [{ columnId: { not: null } }, { column: { deletedAt: { not: null } } }],
      },
      {
        AND: [
          { planningId: { not: null } },
          { planning: { deletedAt: { not: null } } },
        ],
      },
    ],
  });

  cannot(['read', 'update', 'delete'], 'WorkOrderChecklistItem', {
    OR: [
      { workOrder: { deletedAt: { not: null } } },
      { workOrder: { company: { deletedAt: { not: null } } } },
      { workOrder: { location: { deletedAt: { not: null } } } },
      { workOrder: { location: { regional: { deletedAt: { not: null } } } } },
    ],
  });

  cannot(['read', 'update', 'delete'], 'User', {
    OR: [
      { company: { deletedAt: { not: null } } },
      {
        AND: [
          { regionalId: { not: null } },
          { regional: { deletedAt: { not: null } } },
        ],
      },
    ],
  });

  cannot(['read', 'update', 'delete'], 'Queue', {
    OR: [{ company: { deletedAt: { not: null } } }, { deletedAt: { not: null } }],
  });

  cannot(['read', 'update', 'delete'], 'QueueUser', {
    OR: [
      { user: { deletedAt: { not: null } } },
      { user: { company: { deletedAt: { not: null } } } },
      { queue: { deletedAt: { not: null } } },
      { queue: { company: { deletedAt: { not: null } } } },
    ],
  });

  cannot(['read', 'update', 'delete'], 'PlanningResponsible', {
    OR: [
      { user: { deletedAt: { not: null } } },
      { user: { company: { deletedAt: { not: null } } } },
      { planning: { deletedAt: { not: null } } },
      { planning: { company: { deletedAt: { not: null } } } },
    ],
  });

  cannot(['read', 'update', 'delete'], 'WorkOrderQueue', {
    OR: [
      { workOrder: { deletedAt: { not: null } } },
      { workOrder: { company: { deletedAt: { not: null } } } },
      { queue: { deletedAt: { not: null } } },
      { queue: { company: { deletedAt: { not: null } } } },
    ],
  });

  cannot(['read', 'update', 'delete'], 'IpLocation', {
    OR: [
      { company: { deletedAt: { not: null } } },
      { location: { deletedAt: { not: null } } },
      { location: { regional: { deletedAt: { not: null } } } },
      { deletedAt: { not: null } },
    ],
  });
}

/**
 * Permissões base de QueueUser (vínculo fila ↔ usuário).
 * A ocultação de usuários excluídos é aplicada em `aplicarRestricoesSoftDeleteEmCascata`.
 */
function aplicarPermissoesQueueUser(user: User, { can }: any) {
  if (user.role === Roles.SYSTEM_ADMIN) {
    return;
  }

  can('read', 'QueueUser', {
    queue: { companyId: user.companyId },
  });

  if (user.role === Roles.ADMIN) {
    can(['create', 'update', 'delete'], 'QueueUser', {
      queue: { companyId: user.companyId },
    });
  }
}

function aplicarPermissoesPlanningResponsible(user: User, { can }: any) {
  if (user.role === Roles.SYSTEM_ADMIN) {
    return;
  }

  can('read', 'PlanningResponsible', {
    planning: { companyId: user.companyId },
  });

  if (user.role === Roles.ADMIN) {
    can(['create', 'update', 'delete'], 'PlanningResponsible', {
      planning: { companyId: user.companyId },
    });
  }
}

function aplicarPermissoesWorkOrderQueue(user: User, { can }: any) {
  if (user.role === Roles.SYSTEM_ADMIN) {
    return;
  }

  can('read', 'WorkOrderQueue', {
    workOrder: { companyId: user.companyId },
  });

  if (user.role === Roles.ADMIN) {
    can(['create', 'update', 'delete'], 'WorkOrderQueue', {
      workOrder: { companyId: user.companyId },
    });
  }
}

/**
 * Where Prisma para incluir apenas QueueUser legíveis em includes aninhados
 * (não excluídos e usuário ativo). Status da fila não é filtrado aqui para
 * permitir gestão de filas inativas; em OS use `construirWhereWorkOrderQueueLegivel`.
 * Não usa `accessibleBy` porque regras `read all` (ADMIN) injetam `companyId`
 * direto em QueueUser, campo que não existe no modelo e quebra o Prisma.
 */
export function construirWhereQueueUserLegivel(
  companyId?: string,
): Prisma.QueueUserWhereInput {
  return {
    user: {
      deletedAt: null,
      status: UserStatus.ACTIVE,
      company: { deletedAt: null },
      ...(companyId ? { companyId } : {}),
    },
    queue: {
      deletedAt: null,
      company: { deletedAt: null },
      ...(companyId ? { companyId } : {}),
    },
  };
}

/** Where Prisma para includes de responsáveis legíveis em planejamentos (não excluídos e ativos). */
export function construirWherePlanningResponsibleLegivel(
  companyId?: string,
): Prisma.PlanningResponsibleWhereInput {
  return {
    user: {
      deletedAt: null,
      status: UserStatus.ACTIVE,
      company: { deletedAt: null },
      ...(companyId ? { companyId } : {}),
    },
    planning: {
      deletedAt: null,
      company: { deletedAt: null },
      ...(companyId ? { companyId } : {}),
    },
  };
}

/** Where Prisma para vínculos OS↔fila legíveis em includes aninhados (fila não excluída e ativa). */
export function construirWhereWorkOrderQueueLegivel(
  companyId?: string,
): Prisma.WorkOrderQueueWhereInput {
  return {
    workOrder: {
      deletedAt: null,
      company: { deletedAt: null },
      ...(companyId ? { companyId } : {}),
    },
    queue: {
      deletedAt: null,
      status: QueueStatus.ACTIVE,
      company: { deletedAt: null },
      ...(companyId ? { companyId } : {}),
    },
  };
}

const rolePermissionsMap: Record<Roles, (user: User, builder: any) => void> = {
  SYSTEM_ADMIN: (user: User, { can }: any) => {
    can('manage', 'all');
  },

  ADMIN: (user: User, { can }: any) => {
    administrativePermissions.companyRead(user, { can });
    administrativePermissions.companyManage(user, { can });
    administrativePermissions.userManagement(user, { can }, [
      Roles.ADMIN,
      Roles.FIELD_TEAM,
      Roles.C2C,
    ]);
    administrativePermissions.resourceManagement(user, { can });
    administrativePermissions.reporting(user, { can });
    specificPermissions.notifications(user, { can });
    specificPermissions.workOrdersManage(user, { can });
    specificPermissions.queuesManage(user, { can });
    specificPermissions.ipLocationsManage(user, { can });
  },

  FIELD_TEAM: (user: User, { can, cannot }: any) => {
    profilePermissions.ownProfileExtended(user, { can });
    basicResourcePermissions.readDocuments(user, { can });
    operationalReadScopePermissions.assetsLocationsRegionalsRead(user, { can });
    specificPermissions.notificationsFieldTeam(user, { can });
    specificPermissions.workOrdersManage(user, { can });
    specificPermissions.workOrderColumnsManage(user, { can });
    specificPermissions.planningManage(user, { can });
    aplicarRestricaoGestaoEquipe(user, { cannot });
    specificPermissions.queuesRead(user, { can });
    cannot(['create', 'update', 'delete'], 'Queue', {
      companyId: user.companyId,
    });
    cannot(['create', 'update', 'delete'], 'Location', {
      companyId: user.companyId,
    });
    cannot(['create', 'update', 'delete'], 'Asset', {
      companyId: user.companyId,
    });
    cannot(['create', 'update', 'delete'], 'IpLocation', {
      companyId: user.companyId,
    });
  },

  C2C: (user: User, { can, cannot }: any) => {
    profilePermissions.ownProfileExtended(user, { can });
    operationalReadScopePermissions.assetsLocationsRegionalsRead(user, { can });
    basicResourcePermissions.readDocuments(user, { can });
    specificPermissions.notifications(user, { can });
    specificPermissions.workOrdersManage(user, { can });
    specificPermissions.workOrderColumnsManage(user, { can });
    specificPermissions.planningManage(user, { can });
    aplicarRestricaoGestaoEquipeC2c(user, { can, cannot });
    specificPermissions.queuesRead(user, { can });
    cannot(['create', 'update', 'delete'], 'Queue', {
      companyId: user.companyId,
    });
    specificPermissions.ipLocationsC2cMutate(user, { can });
    specificPermissions.locationsC2cMutate(user, { can });
    cannot('delete', 'IpLocation', { companyId: user.companyId });
  },
};

@Injectable({ scope: Scope.REQUEST })
export class CaslAbilityService {
  ability: AppAbility;

  /** Usuário da requisição (para filtros adicionais fora do CASL). */
  private usuarioAtivo!: User;

  constructor(
    @Optional() @Inject(REQUEST) private readonly request?: Request,
  ) {}

  createForUser(user: User) {
    const builder = new AbilityBuilder<AppAbility>(createPrismaAbility);
    this.usuarioAtivo = user;

    rolePermissionsMap[user.role](user, builder);

    if (user.role === Roles.C2C) {
      aplicarRestricoesPerfilC2c(user, builder);
    }

    const ignorarEscopoRegionalLeitura = deveIgnorarEscopoRegionalNaLeitura(
      user,
      this.request as Record<string, unknown> | undefined,
    );

    aplicarRestricoesRegionaisNaoAdmin(user, builder, {
      ignorarEscopoRegionalLeitura,
    });
    aplicarPermissoesQueueUser(user, builder);
    aplicarPermissoesPlanningResponsible(user, builder);
    aplicarPermissoesWorkOrderQueue(user, builder);
    aplicarRestricoesSoftDeleteEmCascata(builder);

    this.ability = builder.build();
    return this.ability;
  }

  obterUsuarioAtivo(): User {
    return this.usuarioAtivo;
  }
}
