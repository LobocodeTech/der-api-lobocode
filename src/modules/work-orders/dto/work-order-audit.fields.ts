/** Include Prisma para expor criador e último editor da OS nas respostas. */
export const WORK_ORDER_AUDIT_USER_SELECT = {
  id: true,
  name: true,
  role: true,
} as const;

export const WORK_ORDER_AUDIT_USER_INCLUDE = {
  createdByUser: {
    select: WORK_ORDER_AUDIT_USER_SELECT,
  },
  updatedByUser: {
    select: WORK_ORDER_AUDIT_USER_SELECT,
  },
} as const;

export interface WorkOrderAuditUserDto {
  id: string;
  name: string;
  role?: string;
}
