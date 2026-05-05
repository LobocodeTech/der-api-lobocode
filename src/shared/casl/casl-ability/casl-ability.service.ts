import { Injectable, Scope } from '@nestjs/common';
import { AbilityBuilder, PureAbility } from '@casl/ability';
import { createPrismaAbility, PrismaQuery, Subjects } from '@casl/prisma';
import { Roles, User, PermissionType } from '@prisma/client';
import { isUsuarioAdministradorEmpresaOuSistema } from '../../regional-scope/regional-scope.helper';

// Tipo estendido para User com permissões
type UserWithPermissions = User & {
  permissions?: Array<{
    permissionType: PermissionType;
    granted: boolean;
  }>;
};

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
};

const operationalReadScopePermissions = {
  assetsLocationsRegionalsRead: (user: User, { can }: any) => {
    can('read', 'Regional', { companyId: user.companyId });
    can('read', 'Location', { companyId: user.companyId });
    can('read', 'Asset', { companyId: user.companyId });
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

// ========================================
// MAPEAMENTO DE ROLES (schema DEPARTAMENTO ESTADUAL DE RODOVIAS: SYSTEM_ADMIN, ADMIN, FISCAL_CAMPO, OPERADOR, INSPETOR_VIA)
// ========================================

/**
 * Inspetor não recebe `companyRead`; concede leitura mínima da cadeia regional → localidade → ativo.
 */
function concederLeituraCadeiaRegionalCampo(user: User, { can }: any) {
  if (!user.regionalId) {
    return;
  }
  const c = user.companyId;
  const r = user.regionalId;
  can('read', 'Regional', { companyId: c, id: r });
  can('read', 'Location', { companyId: c, regionalId: r });
  can('read', 'Asset', { companyId: c, location: { regionalId: r } });
}

/**
 * Restringe leitura e mutação de Regional, Location, Asset, WorkOrder e User (listagens)
 * ao escopo da regional do usuário. Admin / SYSTEM_ADMIN não são alterados.
 */
function aplicarRestricoesRegionaisNaoAdmin(user: User, { cannot }: any) {
  if (isUsuarioAdministradorEmpresaOuSistema(user)) {
    return;
  }

  const c = user.companyId;

  if (!user.regionalId) {
    cannot('read', 'Regional', { companyId: c });
    cannot('read', 'Location', { companyId: c });
    cannot('read', 'Asset', { companyId: c });
    cannot('read', 'WorkOrder', { companyId: c });
    for (const action of ['create', 'update', 'delete'] as const) {
      cannot(action, 'Regional', { companyId: c });
      cannot(action, 'Location', { companyId: c });
      cannot(action, 'Asset', { companyId: c });
      cannot(action, 'WorkOrder', { companyId: c });
    }
    cannot('read', 'User', { companyId: c, NOT: { id: user.id } });
    for (const action of ['create', 'update', 'delete'] as const) {
      cannot(action, 'User', { companyId: c, NOT: { id: user.id } });
    }
    return;
  }

  const r = user.regionalId;
  const workOrderPermitidoForaRegional = {
    OR: [{ location: { regionalId: r } }, { assignees: { some: { userId: user.id } } }],
  };

  cannot('read', 'Regional', { companyId: c, NOT: { id: r } });
  cannot('read', 'Location', { companyId: c, NOT: { regionalId: r } });
  cannot('read', 'Asset', {
    companyId: c,
    NOT: { location: { regionalId: r } },
  });
  cannot('read', 'WorkOrder', {
    companyId: c,
    NOT: workOrderPermitidoForaRegional,
  });

  for (const action of ['create', 'update', 'delete'] as const) {
    cannot(action, 'Regional', { companyId: c, NOT: { id: r } });
    cannot(action, 'Location', { companyId: c, NOT: { regionalId: r } });
    cannot(action, 'Asset', {
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

  cannot('read', 'User', {
    companyId: c,
    NOT: { OR: [{ id: user.id }, { regionalId: r }] },
  });
  for (const action of ['create', 'update', 'delete'] as const) {
    cannot(action, 'User', {
      companyId: c,
      NOT: { OR: [{ id: user.id }, { regionalId: r }] },
    });
  }
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
  },

  FIELD_TEAM: (user: User, { can, cannot }: any) => {
    profilePermissions.ownProfileExtended(user, { can });
    basicResourcePermissions.readDocuments(user, { can });
    operationalReadScopePermissions.assetsLocationsRegionalsRead(user, { can });
    specificPermissions.notifications(user, { can });
    specificPermissions.workOrdersManage(user, { can });
    specificPermissions.workOrderColumnsManage(user, { can });
    specificPermissions.planningManage(user, { can });
    aplicarRestricaoGestaoEquipe(user, { cannot });
  },

  C2C: (user: User, { can, cannot }: any) => {
    administrativePermissions.companyRead(user, { can });
    profilePermissions.ownProfileExtended(user, { can });
    basicResourcePermissions.readDocuments(user, { can });
    operationalPermissions.clientManagement(user, { can });
    operationalReadScopePermissions.assetsLocationsRegionalsRead(user, { can });
    specificPermissions.notifications(user, { can });
    specificPermissions.workOrdersManage(user, { can });
    aplicarRestricaoGestaoEquipe(user, { cannot });
  },
};

@Injectable({ scope: Scope.REQUEST })
export class CaslAbilityService {
  ability: AppAbility;

  /** Usuário da requisição (para filtros adicionais fora do CASL). */
  private usuarioAtivo!: User;

  createForUser(user: User) {
    const builder = new AbilityBuilder<AppAbility>(createPrismaAbility);
    this.usuarioAtivo = user;

    rolePermissionsMap[user.role](user, builder);

    if (user.role === Roles.C2C) {
      concederLeituraCadeiaRegionalCampo(user, builder);
    }

    aplicarRestricoesRegionaisNaoAdmin(user, builder);
    aplicarRestricoesSoftDeleteEmCascata(builder);

    this.ability = builder.build();
    return this.ability;
  }

  obterUsuarioAtivo(): User {
    return this.usuarioAtivo;
  }

  // Método auxiliar para verificar permissões específicas
  hasPermission(user: User, permissionType: PermissionType): boolean {
    const userWithPermissions = user as UserWithPermissions;
    return (
      userWithPermissions.permissions?.some(
        (p) => p.permissionType === permissionType && p.granted,
      ) ?? false
    );
  }
}
