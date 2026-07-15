/** Include Prisma para expor criador, editor e atores do ciclo de vida da OS. */
export const WORK_ORDER_AUDIT_USER_SELECT = {
  id: true,
  name: true,
  role: true,
} as const;

/** Ator do ciclo (iniciar / concluir / aprovar) com membros da equipe de campo ativos. */
export const WORK_ORDER_LIFECYCLE_ACTOR_SELECT = {
  id: true,
  name: true,
  role: true,
  fieldTeamMembers: {
    where: { deletedAt: null },
    select: { id: true, name: true, level: true },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

export const WORK_ORDER_AUDIT_USER_INCLUDE = {
  createdByUser: {
    select: WORK_ORDER_AUDIT_USER_SELECT,
  },
  updatedByUser: {
    select: WORK_ORDER_AUDIT_USER_SELECT,
  },
  startedByUser: {
    select: WORK_ORDER_LIFECYCLE_ACTOR_SELECT,
  },
  completedByUser: {
    select: WORK_ORDER_LIFECYCLE_ACTOR_SELECT,
  },
  approvedByUser: {
    select: WORK_ORDER_LIFECYCLE_ACTOR_SELECT,
  },
} as const;

export interface WorkOrderAuditUserDto {
  id: string;
  name: string;
  role?: string;
}

export interface WorkOrderLifecycleActorMemberDto {
  id: string;
  name: string;
  level: string;
}

export interface WorkOrderLifecycleActorDto extends WorkOrderAuditUserDto {
  fieldTeamMembers?: WorkOrderLifecycleActorMemberDto[];
}
