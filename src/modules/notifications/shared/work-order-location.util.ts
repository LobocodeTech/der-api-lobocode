import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface WorkOrderLocationInfo {
  code: string;
  city: string;
  referenceKm: string;
  regionalCgr: string | null;
  regionalCity: string | null;
}

export interface WorkOrderNotificationParts {
  /** Código sequencial (`OS-12`) ou fallback `OS`. */
  osLabel: string;
  locationString: string;
}

export function formatWorkOrderLocationString(
  info: WorkOrderLocationInfo | null,
): string {
  if (!info) {
    return '';
  }

  const parts: string[] = [];

  if (info.code) {
    parts.push(`Localidade ${info.code}`);
  }
  if (info.referenceKm) {
    parts.push(`KM ${info.referenceKm}`);
  }
  if (info.city) {
    parts.push(info.city);
  }
  if (info.regionalCgr || info.regionalCity) {
    const regionalParts = [info.regionalCgr, info.regionalCity].filter(
      (part): part is string => !!part?.trim(),
    );
    parts.push(`Regional ${regionalParts.join(' - ')}`);
  }

  return parts.length > 0 ? ` (${parts.join(' - ')})` : '';
}

/** Rótulo da OS e sufixo de localidade para mensagens de notificação. */
export async function getWorkOrderNotificationParts(
  prisma: PrismaService,
  workOrderId: string,
): Promise<WorkOrderNotificationParts> {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: workOrderId, deletedAt: null },
    select: {
      sequentialNumber: true,
      location: {
        select: {
          code: true,
          city: true,
          referenceKm: true,
          regional: {
            select: {
              cgr: true,
              city: true,
            },
          },
        },
      },
    },
  });

  const osLabel = workOrder?.sequentialNumber?.trim() || 'OS';

  if (!workOrder?.location) {
    return {
      osLabel,
      locationString: formatWorkOrderLocationString(null),
    };
  }

  return {
    osLabel,
    locationString: formatWorkOrderLocationString({
      code: workOrder.location.code,
      city: workOrder.location.city,
      referenceKm: workOrder.location.referenceKm,
      regionalCgr: workOrder.location.regional?.cgr ?? null,
      regionalCity: workOrder.location.regional?.city ?? null,
    }),
  };
}
