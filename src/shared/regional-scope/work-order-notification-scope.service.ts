import { Injectable } from '@nestjs/common';
import { Prisma, Roles, User, WorkOrderType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { construirClausulaOsVisivelParaUsuario } from './regional-scope.helper';

/** entityType de notificações vinculadas a ordens de serviço. */
export const ENTITY_TYPES_NOTIFICACAO_OS = [
  'work-order',
  'work-order-unassignment',
  'work-order-deadline',
] as const;

@Injectable()
export class WorkOrderNotificationScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Destinatários de broadcast ao criar OS: admins (todas), C2C (somente corretivas),
   * FIELD_TEAM (regional da OS ou membro de fila associada à OS).
   */
  async resolverDestinatariosBroadcastCriacaoOs(
    workOrderId: string,
    companyId: string,
  ): Promise<string[]> {
    const ordem = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, companyId, deletedAt: null },
      select: {
        type: true,
        location: { select: { regionalId: true } },
      },
    });
    if (!ordem) {
      return [];
    }

    const baseAtivo: Prisma.UserWhereInput = {
      companyId,
      status: 'ACTIVE',
      deletedAt: null,
    };

    const [admins, c2c, fieldTeam] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          ...baseAtivo,
          role: { in: [Roles.SYSTEM_ADMIN, Roles.ADMIN] },
        },
        select: { id: true },
      }),
      ordem.type === WorkOrderType.CORRECTIVE
        ? this.prisma.user.findMany({
            where: { ...baseAtivo, role: Roles.C2C },
            select: { id: true },
          })
        : Promise.resolve([]),
      this.buscarFieldTeamElegivelParaOs(workOrderId, companyId, ordem.location?.regionalId ?? null),
    ]);

    return Array.from(
      new Set([
        ...admins.map((u) => u.id),
        ...c2c.map((u) => u.id),
        ...fieldTeam,
      ]),
    );
  }

  /**
   * Mantém apenas usuários que podem ver a OS (alinhado ao CASL / escopo regional).
   */
  async filtrarDestinatariosPorEscopoOs(
    workOrderId: string,
    userIds: string[],
  ): Promise<string[]> {
    const ids = Array.from(new Set(userIds.filter(Boolean)));
    if (ids.length === 0) {
      return [];
    }

    const ordem = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, deletedAt: null },
      select: { type: true },
    });
    if (!ordem) {
      return [];
    }

    const usuarios = await this.prisma.user.findMany({
      where: { id: { in: ids }, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, role: true, regionalId: true },
    });

    const elegiveis = new Set<string>();
    const fieldTeamParaValidar: string[] = [];

    for (const usuario of usuarios) {
      if (
        usuario.role === Roles.ADMIN ||
        usuario.role === Roles.SYSTEM_ADMIN
      ) {
        elegiveis.add(usuario.id);
        continue;
      }
      if (usuario.role === Roles.C2C) {
        if (ordem.type === WorkOrderType.CORRECTIVE) {
          elegiveis.add(usuario.id);
        }
        continue;
      }
      if (usuario.role === Roles.FIELD_TEAM) {
        fieldTeamParaValidar.push(usuario.id);
      } else {
        elegiveis.add(usuario.id);
      }
    }

    if (fieldTeamParaValidar.length > 0) {
      const permitidos = await this.filtrarFieldTeamPorEscopoOs(
        workOrderId,
        fieldTeamParaValidar,
      );
      permitidos.forEach((id) => elegiveis.add(id));
    }

    return ids.filter((id) => elegiveis.has(id));
  }

  /**
   * IDs de OS visíveis para FIELD_TEAM (subconsulta na listagem de notificações).
   */
  async buscarIdsOsVisiveisParaUsuario(
    user: Pick<User, 'id' | 'role' | 'regionalId' | 'companyId'>,
  ): Promise<string[]> {
    if (user.role !== Roles.FIELD_TEAM) {
      return [];
    }

    const rows = await this.prisma.workOrder.findMany({
      where: {
        deletedAt: null,
        ...(user.companyId ? { companyId: user.companyId } : {}),
        ...construirClausulaOsVisivelParaUsuario(user),
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  construirWhereNotificacoesOsFieldTeam(
    user: Pick<User, 'id' | 'role' | 'regionalId' | 'companyId'>,
    osVisiveisIds: string[],
  ): Prisma.NotificationWhereInput {
    return {
      OR: [
        { entityType: { notIn: [...ENTITY_TYPES_NOTIFICACAO_OS] } },
        { entityId: null },
        {
          entityType: { in: [...ENTITY_TYPES_NOTIFICACAO_OS] },
          entityId: { in: osVisiveisIds.length > 0 ? osVisiveisIds : ['__none__'] },
        },
      ],
    };
  }

  private async buscarFieldTeamElegivelParaOs(
    workOrderId: string,
    companyId: string,
    regionalIdOs: string | null,
  ): Promise<string[]> {
    const membroFilaNaOs: Prisma.UserWhereInput = {
      queueUsers: {
        some: {
          queue: {
            workOrderQueues: { some: { workOrderId } },
          },
        },
      },
    };

    const or: Prisma.UserWhereInput[] = [membroFilaNaOs];
    if (regionalIdOs) {
      or.unshift({ regionalId: regionalIdOs });
    }

    const usuarios = await this.prisma.user.findMany({
      where: {
        companyId,
        role: Roles.FIELD_TEAM,
        status: 'ACTIVE',
        deletedAt: null,
        OR: or,
      },
      select: { id: true },
    });

    return usuarios.map((u) => u.id);
  }

  private async filtrarFieldTeamPorEscopoOs(
    workOrderId: string,
    userIds: string[],
  ): Promise<string[]> {
    const ordem = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, deletedAt: null },
      select: {
        type: true,
        location: { select: { regionalId: true } },
      },
    });
    if (!ordem) {
      return [];
    }

    const usuarios = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, regionalId: true },
    });

    const naFila = await this.prisma.queueUser.findMany({
      where: {
        userId: { in: userIds },
        queue: {
          workOrderQueues: { some: { workOrderId } },
        },
      },
      select: { userId: true },
    });
    const naFilaSet = new Set(naFila.map((row) => row.userId));
    const regionalOs = ordem.location?.regionalId ?? null;

    return usuarios
      .filter((usuario) => {
        if (naFilaSet.has(usuario.id)) {
          return true;
        }
        if (!usuario.regionalId || !regionalOs) {
          return false;
        }
        return usuario.regionalId === regionalOs;
      })
      .map((usuario) => usuario.id);
  }
}
