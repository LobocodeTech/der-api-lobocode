import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QueueStatus, Roles, UserStatus } from '@prisma/client';
import { PrismaService } from 'src/shared/prisma/prisma.service';

export const WORK_ORDER_QUEUE_INCLUDE = {
  queue: {
    select: {
      id: true,
      title: true,
      status: true,
      queueUsers: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
              role: true,
              profilePicture: true,
              status: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.WorkOrderQueueInclude;

/** Include de `workOrder.workOrderQueues` no Prisma (precisa do wrapper `include`). */
export const WORK_ORDER_QUEUES_ON_WORK_ORDER_INCLUDE = {
  include: WORK_ORDER_QUEUE_INCLUDE,
} satisfies Prisma.WorkOrder$workOrderQueuesArgs;

export type WorkOrderQueueWithUsers = {
  id: string;
  title: string;
  users: Array<{
    id: string;
    name: string;
    role?: string;
    profilePicture?: string | null;
  }>;
};

export type ResolvedWorkOrderUser = {
  id: string;
  name: string;
  role?: string;
};

const ELIGIBLE_ROLES: Roles[] = [Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C];

@Injectable()
export class WorkOrderQueueUsersService {
  constructor(private readonly prisma: PrismaService) {}

  normalizarQueueIds(ids?: string[]): string[] {
    return Array.from(
      new Set(
        [...(ids ?? [])]
          .filter(Boolean)
          .map((value) => String(value).trim()),
      ),
    ).filter(Boolean);
  }

  async validarFilasDaEmpresa(
    queueIds: string[],
    companyId: string,
  ): Promise<Array<{ id: string; title: string }>> {
    if (queueIds.length === 0) {
      return [];
    }

    const filas = await this.prisma.queue.findMany({
      where: {
        id: { in: queueIds },
        companyId,
        deletedAt: null,
        status: QueueStatus.ACTIVE,
      },
      select: { id: true, title: true },
    });

    if (filas.length !== queueIds.length) {
      throw new NotFoundException(
        'Uma ou mais filas não foram encontradas, estão inativas ou não pertencem à empresa.',
      );
    }

    return filas;
  }

  async resolveUsersFromQueueIds(
    queueIds: string[],
    companyId?: string,
  ): Promise<ResolvedWorkOrderUser[]> {
    const ids = this.normalizarQueueIds(queueIds);
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.prisma.queueUser.findMany({
      where: {
        queueId: { in: ids },
        queue: {
          deletedAt: null,
          ...(companyId ? { companyId } : {}),
        },
        user: {
          status: UserStatus.ACTIVE,
          deletedAt: null,
          role: { in: ELIGIBLE_ROLES },
          ...(companyId ? { companyId } : {}),
        },
      },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    const byId = new Map<string, ResolvedWorkOrderUser>();
    for (const row of rows) {
      if (!row.user) continue;
      byId.set(row.user.id, {
        id: row.user.id,
        name: row.user.name,
        role: row.user.role,
      });
    }

    return Array.from(byId.values());
  }

  async resolveQueueIdsFromWorkOrderId(workOrderId: string): Promise<string[]> {
    const links = await this.prisma.workOrderQueue.findMany({
      where: { workOrderId },
      select: { queueId: true },
    });
    return links.map((link) => link.queueId);
  }

  async resolveUsersFromWorkOrderId(
    workOrderId: string,
    companyId?: string,
  ): Promise<ResolvedWorkOrderUser[]> {
    const queueIds = await this.resolveQueueIdsFromWorkOrderId(workOrderId);
    return this.resolveUsersFromQueueIds(queueIds, companyId);
  }

  diffQueueIds(previousIds: string[], nextIds: string[]): {
    added: string[];
    removed: string[];
  } {
    const previous = new Set(previousIds);
    const next = new Set(nextIds);
    return {
      added: nextIds.filter((id) => !previous.has(id)),
      removed: previousIds.filter((id) => !next.has(id)),
    };
  }

  async resolveUserIdsFromWorkOrderId(
    workOrderId: string,
    companyId?: string,
  ): Promise<string[]> {
    const users = await this.resolveUsersFromWorkOrderId(workOrderId, companyId);
    return users.map((user) => user.id);
  }

  mapQueuesToResponse(
    workOrderQueues: Array<{
      queue?: {
        id: string;
        title: string;
        status?: QueueStatus;
        queueUsers?: Array<{
          user?: {
            id: string;
            name: string;
            role?: string;
            profilePicture?: string | null;
            status?: UserStatus;
          } | null;
        }>;
      } | null;
    }>,
  ): WorkOrderQueueWithUsers[] {
    return workOrderQueues
      .map((row) => {
        const queue = row.queue;
        if (!queue) return null;

        const seen = new Set<string>();
        const users: WorkOrderQueueWithUsers['users'] = [];

        for (const qu of queue.queueUsers ?? []) {
          const user = qu.user;
          if (!user || seen.has(user.id)) continue;
          if (user.status && user.status !== UserStatus.ACTIVE) continue;
          seen.add(user.id);
          users.push({
            id: user.id,
            name: user.name,
            role: user.role,
            profilePicture: user.profilePicture ?? null,
          });
        }

        return {
          id: queue.id,
          title: queue.title,
          users,
        };
      })
      .filter((queue): queue is WorkOrderQueueWithUsers => queue !== null);
  }

  mapAssigneesFromQueues(queues: WorkOrderQueueWithUsers[]): ResolvedWorkOrderUser[] {
    const byId = new Map<string, ResolvedWorkOrderUser>();
    for (const queue of queues) {
      for (const user of queue.users) {
        if (!byId.has(user.id)) {
          byId.set(user.id, {
            id: user.id,
            name: user.name,
            role: user.role,
          });
        }
      }
    }
    return Array.from(byId.values());
  }

  mapAssigneesPrismaShape(
    users: ResolvedWorkOrderUser[],
  ): Array<{ userId: string; user: { id: string; name: string; role?: string } }> {
    return users.map((user) => ({
      userId: user.id,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
    }));
  }
}
