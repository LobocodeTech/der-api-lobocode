import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Prisma, QueueStatus, Roles } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  UniversalService,
  UniversalRepository,
  UniversalMetricsService,
  UniversalQueryService,
  UniversalPermissionService,
  createEntityConfig,
  IncludeConfig,
} from '../../shared/universal';
import { ConflictError, NotFoundError } from '../../shared/common/errors';
import { construirWhereQueueUserLegivel } from '../../shared/casl/casl-ability/casl-ability.service';
import { QueueActivityNotificationService } from '../notifications/shared/queue-activity-notification.service';
import { CreateQueuesDto } from './dto/create-queues.dto';
import { UpdateQueuesDto } from './dto/update-queues.dto';

function normalizarChaveTituloFila(title: string): string {
  return title
    .trim()
    .normalize('NFKC')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ');
}

@Injectable({ scope: Scope.REQUEST })
export class QueuesService extends UniversalService<
  CreateQueuesDto,
  UpdateQueuesDto
> {
  private static readonly entityConfig = createEntityConfig('queue');

  constructor(
    repository: UniversalRepository<CreateQueuesDto, UpdateQueuesDto>,
    queryService: UniversalQueryService,
    permissionService: UniversalPermissionService,
    metricsService: UniversalMetricsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly queueActivityNotificationService: QueueActivityNotificationService,
    @Optional() @Inject(REQUEST) request: any,
  ) {
    const { model, casl } = QueuesService.entityConfig;
    super(
      repository,
      queryService,
      permissionService,
      metricsService,
      request,
      model,
      casl,
    );

    this.setEntityConfig();
  }

  setEntityConfig() {
    const companyId = this.obterUsuarioLogado()?.companyId;

    this.entityConfig = {
      ...this.entityConfig,
      where: {
        deletedAt: null,
        ...(companyId && { companyId }),
      },
      transform: {
        exclude: [
          'queueUsers',
          'companyId',
          'deletedAt',
          'createdAt',
          'updatedAt',
        ],
        custom: (entity: Record<string, unknown>) =>
          this.mapQueueToResponse(entity),
      },
      orderBy: { title: 'asc' },
    };
  }

  protected getIncludeConfig(): IncludeConfig | undefined {
    return this.construirQueueInclude() as unknown as IncludeConfig;
  }

  private construirQueueInclude(): Prisma.QueueInclude {
    const companyId = this.obterUsuarioLogado()?.companyId;
    return {
      queueUsers: {
        where: construirWhereQueueUserLegivel(companyId),
        select: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              profilePicture: true,
            },
          },
        },
      },
    };
  }

  private mapQueueToResponse(entity: Record<string, unknown>) {
    const queueUsers = (entity.queueUsers ?? []) as Array<{
      user?: {
        id: string;
        name: string;
        email?: string;
        profilePicture?: string | null;
      };
    }>;
    const users = queueUsers
      .map((row) => row.user)
      .filter(
        (user): user is NonNullable<typeof user> =>
          user != null && typeof user.id === 'string',
      )
      .map((user) => ({
        id: user.id,
        name: user.name,
        profilePicture: user.profilePicture ?? null,
      }));

    return {
      id: entity.id,
      title: entity.title,
      status: entity.status,
      usersCount: users.length,
      users,
    };
  }

  private normalizarUserIds(userIds: string[]): string[] {
    return Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
  }

  private async validarUsuariosDaEmpresa(
    userIds: string[],
    companyId: string,
  ): Promise<void> {
    if (userIds.length === 0) {
      return;
    }

    const encontrados = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        companyId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (encontrados.length !== userIds.length) {
      throw new BadRequestException(
        'Um ou mais usuários são inválidos ou não pertencem à empresa.',
      );
    }
  }

  private async encontrarFilaComTituloDuplicado(
    title: string,
    excluirQueueId?: string,
  ): Promise<{ id: string; title: string } | null> {
    const companyId = this.obterUsuarioLogado()?.companyId;
    const chave = normalizarChaveTituloFila(title);

    const where: Prisma.QueueWhereInput = {
      deletedAt: null,
      ...(companyId ? { companyId } : {}),
    };

    const lista = (await this.repository.buscarMuitos(
      this.entityName,
      where,
    )) as Array<{ id: string; title: string }>;

    const duplicata = lista.find((fila) => {
      if (excluirQueueId && fila.id === excluirQueueId) {
        return false;
      }
      return normalizarChaveTituloFila(fila.title) === chave;
    });

    return duplicata ?? null;
  }

  private async sincronizarUsuariosFila(
    queueId: string,
    userIds: string[],
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await tx.queueUser.deleteMany({
      where: { queueId },
    });

    if (userIds.length > 0) {
      await tx.queueUser.createMany({
        data: userIds.map((userId) => ({
          queueId,
          userId,
        })),
      });
    }
  }

  private async buscarFilaComIncludes(id: string, companyId: string) {
    const fila = await this.prisma.queue.findFirst({
      where: {
        id,
        deletedAt: null,
        companyId,
      },
      include: this.construirQueueInclude(),
    });

    if (!fila) {
      throw new NotFoundError(this.entityName, id, 'id');
    }

    return fila;
  }

  private async obterUserIdsDaFila(queueId: string): Promise<string[]> {
    const rows = await this.prisma.queueUser.findMany({
      where: { queueId },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  private async notificarAssociacoesNaCriacao(params: {
    queueId: string;
    queueTitle: string;
    userIds: string[];
    actorUserId: string;
    companyId: string;
  }): Promise<void> {
    for (const assignedUserId of params.userIds) {
      if (assignedUserId === params.actorUserId) {
        continue;
      }
      await this.queueActivityNotificationService.notifyAssociationOnCreate({
        queueId: params.queueId,
        queueTitle: params.queueTitle,
        actorUserId: params.actorUserId,
        companyId: params.companyId,
        assignedUserId,
      });
    }
  }

  private async notificarMudancasUsuariosNaAtualizacao(params: {
    queueId: string;
    queueTitle: string;
    previousUserIds: string[];
    nextUserIds: string[];
    actorUserId: string;
    companyId: string;
  }): Promise<void> {
    const previousSet = new Set(params.previousUserIds);
    const nextSet = new Set(params.nextUserIds);

    const novos = params.nextUserIds.filter((id) => !previousSet.has(id));
    const removidos = params.previousUserIds.filter((id) => !nextSet.has(id));

    for (const assignedUserId of novos) {
      if (assignedUserId === params.actorUserId) {
        continue;
      }
      await this.queueActivityNotificationService.notifyAssociationOnUpdate({
        queueId: params.queueId,
        queueTitle: params.queueTitle,
        actorUserId: params.actorUserId,
        companyId: params.companyId,
        assignedUserId,
      });
    }

    for (const removedUserId of removidos) {
      if (removedUserId === params.actorUserId) {
        continue;
      }
      await this.queueActivityNotificationService.notifyUnassociation({
        queueId: params.queueId,
        queueTitle: params.queueTitle,
        actorUserId: params.actorUserId,
        companyId: params.companyId,
        removedUserId,
      });
    }
  }

  protected async antesDeCriar(data: CreateQueuesDto): Promise<void> {
    const duplicata = await this.encontrarFilaComTituloDuplicado(data.title);
    if (duplicata) {
      throw new ConflictError('Já existe uma fila com este título');
    }

    const userIds = this.normalizarUserIds(data.userIds ?? []);
    if (userIds.length === 0) {
      throw new BadRequestException('Pelo menos um usuário deve ser selecionado na fila');
    }
  }

  protected async antesDeAtualizar(
    id: string,
    data: UpdateQueuesDto,
  ): Promise<void> {
    if (data.title === undefined) {
      return;
    }

    const duplicata = await this.encontrarFilaComTituloDuplicado(
      data.title,
      id,
    );
    if (duplicata) {
      throw new ConflictError('Já existe uma fila com este título');
    }
  }

  async criar(data: CreateQueuesDto, include?: unknown, role?: Roles) {
    this.permissionService.validarAction(this.entityNameCasl, 'create');

    if (role) {
      this.permissionService.validarCriacaoDeEntidadeComRole(
        this.entityNameCasl,
        role,
      );
    }

    await this.antesDeCriar(data);

    const user = this.obterUsuarioLogado();
    const companyId = user?.companyId;
    if (!companyId) {
      throw new BadRequestException('Empresa não identificada');
    }

    const userIds = this.normalizarUserIds(data.userIds ?? []);
    await this.validarUsuariosDaEmpresa(userIds, companyId);

    const created = await this.prisma.$transaction(async (tx) => {
      const queue = await tx.queue.create({
        data: {
          title: data.title.trim(),
          status: data.status ?? QueueStatus.ACTIVE,
          companyId,
        },
      });

      await this.sincronizarUsuariosFila(queue.id, userIds, tx);

      return tx.queue.findFirst({
        where: { id: queue.id },
        include: this.construirQueueInclude(),
      });
    });

    await this.depoisDeCriar(created);

    const queueId = (created as { id: string }).id;
    const actorUserId = user.id;
    await this.notificarAssociacoesNaCriacao({
      queueId,
      queueTitle: data.title.trim(),
      userIds,
      actorUserId,
      companyId,
    });

    return this.transformData(created);
  }

  async atualizar(id: string, data: UpdateQueuesDto, include?: unknown) {
    this.permissionService.validarAction(this.entityNameCasl, 'update');
    await this.antesDeAtualizar(id, data);

    const user = this.obterUsuarioLogado();
    const companyId = user?.companyId;
    if (!companyId) {
      throw new BadRequestException('Empresa não identificada');
    }

    await this.buscarFilaComIncludes(id, companyId);

    const userIds =
      data.userIds !== undefined
        ? this.normalizarUserIds(data.userIds)
        : undefined;

    if (userIds !== undefined) {
      await this.validarUsuariosDaEmpresa(userIds, companyId);
    }

    const previousUserIds =
      userIds !== undefined ? await this.obterUserIdsDaFila(id) : [];

    const updateData: Prisma.QueueUpdateInput = {};
    if (data.title !== undefined) {
      updateData.title = data.title.trim();
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.queue.update({
          where: { id },
          data: updateData,
        });
      }

      if (userIds !== undefined) {
        await this.sincronizarUsuariosFila(id, userIds, tx);
      }

      return tx.queue.findFirst({
        where: { id, deletedAt: null, companyId },
        include: this.construirQueueInclude(),
      });
    });

    await this.depoisDeAtualizar(id, data);

    if (userIds !== undefined && user?.id) {
      const queueTitle =
        data.title?.trim() ||
        String((updated as { title?: string })?.title ?? '').trim() ||
        'Fila';

      await this.notificarMudancasUsuariosNaAtualizacao({
        queueId: id,
        queueTitle,
        previousUserIds,
        nextUserIds: userIds,
        actorUserId: user.id,
        companyId,
      });
    }

    return this.transformData(updated);
  }
}
