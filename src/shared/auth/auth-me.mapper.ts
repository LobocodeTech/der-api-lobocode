import { Company, Permission, User } from '@prisma/client';

export type PublicCompany = {
  id: string;
  name: string;
  cnpj: string;
  address: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

/** Alinhado ao JSON `activitiesNotification` do User no Prisma. */
export type PublicActivitiesNotification = {
  assignments: boolean;
  comments: boolean;
  deadlines: boolean;
  reports: boolean;
};

const DEFAULT_ACTIVITIES: PublicActivitiesNotification = {
  assignments: true,
  comments: true,
  deadlines: true,
  reports: true,
};

export function parseActivitiesNotification(
  raw: unknown,
): PublicActivitiesNotification {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_ACTIVITIES };
  }
  const o = raw as Record<string, unknown>;
  return {
    assignments: Boolean(
      o.assignments !== undefined ? o.assignments : DEFAULT_ACTIVITIES.assignments,
    ),
    comments: Boolean(
      o.comments !== undefined ? o.comments : DEFAULT_ACTIVITIES.comments,
    ),
    deadlines: Boolean(
      o.deadlines !== undefined ? o.deadlines : DEFAULT_ACTIVITIES.deadlines,
    ),
    reports: Boolean(
      o.reports !== undefined ? o.reports : DEFAULT_ACTIVITIES.reports,
    ),
  };
}

export type PublicMeUser = {
  id: string;
  email: string;
  login: string;
  name: string;
  phone: string | null;
  profilePicture: string | null;
  role: User['role'];
  status: User['status'];
  companyId: string;
  regionalId: string | null;
  permissions?: Array<{ permissionType: Permission['permissionType'] }>;
  company: PublicCompany | null;
  notificationEmail: boolean;
  notificationPushNotification: boolean;
  activitiesNotification: PublicActivitiesNotification;
};

export function toPublicCompany(
  company: Company | null | undefined,
): PublicCompany | null {
  if (!company) return null;
  return {
    id: company.id,
    name: company.name,
    cnpj: company.cnpj,
    address: company.address ?? null,
    contactName: company.contactName ?? null,
    contactEmail: company.contactEmail ?? null,
    contactPhone: company.contactPhone ?? null,
  };
}

export function toPublicMeUser(
  user: User & {
    company?: Company | null;
    permissions?: Permission[];
  },
): PublicMeUser {
  return {
    id: user.id,
    email: user.email,
    login: user.login,
    name: user.name,
    phone: user.phone ?? null,
    profilePicture: user.profilePicture ?? null,
    role: user.role,
    status: user.status,
    companyId: user.companyId,
    regionalId: user.regionalId ?? null,
    permissions: user.permissions?.map((p) => ({
      permissionType: p.permissionType,
    })),
    company: toPublicCompany(user.company ?? undefined),
    notificationEmail: user.notificationEmail,
    notificationPushNotification: user.notificationPushNotification,
    activitiesNotification: parseActivitiesNotification(
      user.activitiesNotification,
    ),
  };
}
