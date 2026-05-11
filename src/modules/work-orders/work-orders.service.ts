import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import {
  AssetType,
  FileType,
  Prisma,
  Roles,
  UserStatus,
  WorkOrderSlaStatus,
  WorkOrderStatus,
  WorkOrderType,
} from '@prisma/client';
import { FilesService } from 'src/shared/files/services/files.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import {
  UniversalService,
  UniversalRepository,
  UniversalMetricsService,
  UniversalQueryService,
  UniversalPermissionService,
  createEntityConfig,
} from 'src/shared/universal';
import { AssignWorkOrderDto } from './dto/assign-work-order.dto';
import { CompleteWorkOrderDto } from './dto/complete-work-order.dto';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { CreateWorkOrderCommentDto } from './dto/create-work-order-comment.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { UpdateWorkOrderChecklistItemDto } from './dto/update-work-order-checklist-item.dto';
import { CreateWorkOrderCheckListDto } from './dto/create-work-order-checklist-item.dto';
import { MoveWorkOrderColumnDto } from './dto/move-work-order-column.dto';
import { WorkOrderActivityNotificationService } from '../notifications/shared/work-order-activity-notification.service';

@Injectable({ scope: Scope.REQUEST })
export class WorkOrdersService extends UniversalService<
  CreateWorkOrderDto,
  UpdateWorkOrderDto
> {
  private static readonly entityConfig = createEntityConfig('workOrder');
  private pendingCreateAssigneeIds: string[] = [];
  private pendingUpdateAssigneeIds: string[] | null = null;

  private readonly detalhesInclude: any = {
    column: {
      select: {
        id: true,
        name: true,
        color: true,
        regionalId: true,
      },
    },
    location: {
      include: {
        regional: {
          select: {
            id: true,
            cgr: true,
            city: true,
          },
        },
      },
    },
    assignees: {
      include: {
        user: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    },
    checklistItems: {
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    },
    comments: {
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    },
    evidences: {
      include: {
        file: {
          select: {
            id: true,
            originalName: true,
            url: true,
            mimeType: true,
            size: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    },
    workOrderPauseHistories: {
      include: {
        pausedByUser: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    },
    planning: {
      select: {
        id: true,
        title: true,
        serviceType: true,
        equipmentType: true,
        date: true,
        km: true,
        observation: true,
      },
    },
  };

  constructor(
    repository: UniversalRepository<CreateWorkOrderDto, UpdateWorkOrderDto>,
    queryService: UniversalQueryService,
    permissionService: UniversalPermissionService,
    metricsService: UniversalMetricsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FilesService) private readonly filesService: FilesService,
    @Inject(WorkOrderActivityNotificationService)
    private readonly workOrderActivityNotificationService: WorkOrderActivityNotificationService,
    @Optional() @Inject(REQUEST) request: any,
  ) {
    const { model, casl } = WorkOrdersService.entityConfig;
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
      includes: {
        column: {
          select: {
            id: true,
            name: true,
            color: true,
            regionalId: true,
          },
        },
        location: {
          include: {
            regional: {
              select: {
                id: true,
                cgr: true,
                city: true,
              },
            },
          },
        },
        assignees: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
        planning: {
          select: {
            id: true,
            title: true,
            serviceType: true,
            equipmentType: true,
            date: true,
            km: true,
            observation: true,
          },
        },
      },
      where: {
        deletedAt: null,
        ...(companyId && { companyId }),
      },
      orderBy: { createdAt: 'desc' },
    };
  }

  async buscarPorId(id: string, include?: Prisma.WorkOrderInclude) {
    const ordem = await super.buscarPorId(id, include ?? this.detalhesInclude);
    return this.normalizarDetalhesDaOrdem(ordem);
  }

  async buscarDetalhesPorId(id: string) {
    return this.buscarPorId(id, this.detalhesInclude);
  }

  async buscarPorLocalidade(locationId: string) {
    await this.buscarLocalidadeValida(locationId);
    return this.buscarMuitosPorCampo('locationId', locationId);
  }

  async atribuirResponsavel(id: string, dto: AssignWorkOrderDto) {
    const ordem = await this.buscarOrdemPorId(id);

    const userId = dto.assignedToUserIds?.[0];
    if (!userId) {
      throw new BadRequestException('Informe ao menos um responsável.');
    }
    const responsavel = await this.buscarResponsavelValido(userId);

    const jaExiste = ordem.assignees.some(
      (assignee) => assignee.userId === responsavel.id,
    );
    if (!jaExiste) {
      await this.prisma.workOrderAssignee.create({
        data: {
          workOrderId: ordem.id,
          userId: responsavel.id,
        },
      });
    }

    const status =
      ordem.status === WorkOrderStatus.COMPLETED
        ? WorkOrderStatus.COMPLETED
        : WorkOrderStatus.ASSIGNED;

    await this.prisma.workOrder.update({
      where: { id: ordem.id },
      data: {
        status,
        updatedBy: this.obterUsuarioLogadoId() ?? undefined,
        slaStatus: this.calcularSlaStatus(ordem.dueDate, status),
      },
    });

    await this.registrarComentarioAutomatico(
      ordem.id,
      jaExiste
        ? `Responsável ${responsavel.name} já estava vinculado à OS.`
        : `Responsável ${responsavel.name} adicionado à OS.`,
    );

    if (!jaExiste) {
      await this.workOrderActivityNotificationService.notifyAssignment({
        workOrderId: ordem.id,
        workOrderTitle: (ordem as any).title ?? `OS ${ordem.id}`,
        actorUserId: this.obterUsuarioLogadoId() ?? responsavel.id,
        companyId: (ordem as any).companyId ?? this.obterCompanyId() ?? undefined,
        assignedUserId: responsavel.id,
      });
    }

    return this.buscarDetalhesPorId(ordem.id);
  }

  async removerResponsavel(id: string, userId: string) {
    const ordem = await this.buscarOrdemPorId(id);

    const existente = ordem.assignees.find(
      (assignee) => assignee.userId === userId,
    );
    if (!existente) {
      throw new NotFoundException('Responsável não encontrado na OS.');
    }

    await this.prisma.workOrderAssignee.delete({
      where: { id: existente.id },
    });

    const restantes = ordem.assignees.filter(
      (assignee) => assignee.userId !== userId,
    );
    const nextStatus =
      restantes.length === 0 && ordem.status === WorkOrderStatus.ASSIGNED
        ? WorkOrderStatus.PENDING
        : ordem.status;

    await this.prisma.workOrder.update({
      where: { id: ordem.id },
      data: {
        status: nextStatus,
        updatedBy: this.obterUsuarioLogadoId() ?? undefined,
        slaStatus: this.calcularSlaStatus(ordem.dueDate, nextStatus),
      },
    });

    const nome = existente.user?.name ?? 'Responsável';
    await this.registrarComentarioAutomatico(
      ordem.id,
      `Responsável ${nome} removido da OS.`,
    );

    return this.buscarDetalhesPorId(ordem.id);
  }

  async removerItemDoChecklist(id: string, itemId: string) {
    await this.buscarOrdemPorId(id);

    await this.prisma.$transaction(async (tx) => {
      const item = await tx.workOrderChecklistItem.findFirst({
        where: { id: itemId, workOrderId: id },
        select: { id: true },
      });

      if (!item) {
        throw new NotFoundException('Item de checklist não encontrado.');
      }

      await tx.workOrderChecklistItem.delete({
        where: { id: item.id },
      });

      await this.reordenarChecklist(id, tx);
    });

    return this.buscarDetalhesPorId(id);
  }

  async iniciarTrabalho(id: string) {
    const ordem = await this.buscarOrdemPorId(id);

    if (ordem.assignees.length === 0) {
      throw new BadRequestException(
        'A ordem de serviço precisa ter um responsável antes de iniciar.',
      );
    }

    if (ordem.status === WorkOrderStatus.CANCELLED) {
      throw new BadRequestException(
        'Não é possível iniciar uma ordem cancelada.',
      );
    }

    if (
      ordem.status !== WorkOrderStatus.PENDING &&
      ordem.status !== WorkOrderStatus.ASSIGNED
    ) {
      throw new BadRequestException(
        'A OS só pode ser iniciada a partir dos status pendente/atribuída.',
      );
    }

    await this.prisma.workOrder.update({
      where: { id: ordem.id },
      data: {
        status: WorkOrderStatus.IN_PROGRESS,
        startedAt: ordem.startedAt ?? new Date(),
        completedAt: null,
        updatedBy: this.obterUsuarioLogadoId() ?? undefined,
        slaStatus: this.calcularSlaStatus(
          ordem.dueDate,
          WorkOrderStatus.IN_PROGRESS,
        ),
      },
    });

    await this.registrarComentarioAutomatico(
      ordem.id,
      'Trabalho iniciado na ordem de serviço.',
    );

    return this.buscarDetalhesPorId(ordem.id);
  }

  async concluirOrdem(id: string, dto: CompleteWorkOrderDto) {
    const ordem = await this.buscarOrdemPorId(id);

    if (ordem.status === WorkOrderStatus.COMPLETED) {
      throw new BadRequestException('A ordem de serviço já foi concluída.');
    }

    await this.prisma.workOrder.update({
      where: { id: ordem.id },
      data: {
        status: WorkOrderStatus.COMPLETED,
        completedAt: new Date(),
        updatedBy: this.obterUsuarioLogadoId() ?? undefined,
        slaStatus: WorkOrderSlaStatus.OK,
      },
    });

    await this.registrarComentarioAutomatico(
      ordem.id,
      dto.resolutionNotes?.trim()
        ? `OS concluída. ${dto.resolutionNotes.trim()}`
        : 'OS concluída.',
    );

    return this.buscarDetalhesPorId(ordem.id);
  }

  async moverParaColuna(id: string, dto: MoveWorkOrderColumnDto) {
    const companyId = this.obterCompanyId();
    const ordem = await this.prisma.workOrder.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(companyId && { companyId }),
      },
      include: {
        location: {
          select: {
            regionalId: true,
          },
        },
        column: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!ordem) {
      throw new NotFoundException('Ordem de serviço não encontrada.');
    }

    const columnId = dto.columnId ?? null;
    let nomeColunaDestino: string | null = null;
    if (columnId) {
      const coluna = await this.prisma.workOrderColumn.findFirst({
        where: {
          id: columnId,
          deletedAt: null,
          companyId: ordem.companyId,
        },
        select: {
          id: true,
          regionalId: true,
          name: true,
        },
      });

      if (!coluna) {
        throw new NotFoundException('Coluna do Kanban não encontrada.');
      }

      if (
        coluna.regionalId &&
        coluna.regionalId !== (ordem.location?.regionalId ?? null)
      ) {
        throw new BadRequestException(
          'A coluna selecionada pertence a outra regional.',
        );
      }

      nomeColunaDestino = coluna.name;
    }

    const novoStatus = this.obterStatusPorNomeDaColuna(nomeColunaDestino);
    const agora = new Date();

    await this.prisma.workOrder.update({
      where: { id: ordem.id },
      data: {
        columnId,
        status: novoStatus,
        startedAt:
          novoStatus === WorkOrderStatus.IN_PROGRESS &&
          (ordem.status === WorkOrderStatus.PENDING ||
            ordem.status === WorkOrderStatus.ASSIGNED) &&
          !ordem.startedAt
            ? agora
            : undefined,
        completedAt:
          novoStatus === WorkOrderStatus.COMPLETED
            ? agora
            : ordem.status === WorkOrderStatus.COMPLETED
              ? null
              : undefined,
        slaStatus: this.calcularSlaStatus(ordem.dueDate ?? null, novoStatus),
        updatedBy: this.obterUsuarioLogadoId() ?? undefined,
      },
    });

    return this.buscarDetalhesPorId(ordem.id);
  }

  private obterStatusPorNomeDaColuna(
    nomeColuna: string | null,
  ): WorkOrderStatus {
    if (!nomeColuna) {
      return WorkOrderStatus.PENDING;
    }

    const normalizado = nomeColuna
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    if (
      normalizado.includes('conclu') ||
      normalizado.includes('finaliz') ||
      normalizado.includes('encerr')
    ) {
      return WorkOrderStatus.COMPLETED;
    }

    if (
      normalizado.includes('andamento') ||
      normalizado.includes('execu') ||
      normalizado.includes('progresso') ||
      normalizado.includes('fazendo')
    ) {
      return WorkOrderStatus.IN_PROGRESS;
    }

    if (normalizado.includes('atribu')) {
      return WorkOrderStatus.ASSIGNED;
    }

    if (normalizado.includes('cancel')) {
      return WorkOrderStatus.CANCELLED;
    }

    return WorkOrderStatus.PENDING;
  }

  async atualizarItemDoChecklist(
    id: string,
    itemId: string,
    dto: UpdateWorkOrderChecklistItemDto,
  ) {
    await this.buscarOrdemPorId(id);

    const item = await this.prisma.workOrderChecklistItem.findFirst({
      where: {
        id: itemId,
        workOrderId: id,
      },
    });

    if (!item) {
      throw new NotFoundException('Item de checklist não encontrado.');
    }

    await this.prisma.workOrderChecklistItem.update({
      where: { id: item.id },
      data: { isDone: dto.isDone },
    });

    return this.buscarDetalhesPorId(id);
  }

  async criarItemDoChecklist(id: string, dto: CreateWorkOrderCheckListDto) {
    await this.buscarOrdemPorId(id);

    await this.prisma.$transaction(async (tx) => {
      const checklistItems = await tx.workOrderChecklistItem.findMany({
        where: { workOrderId: id },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });

      // Reorganiza antes de inserir para evitar buracos em cenários legados.
      await Promise.all(
        checklistItems.map((item, index) =>
          tx.workOrderChecklistItem.update({
            where: { id: item.id },
            data: { sortOrder: index + 1 },
          }),
        ),
      );

      await tx.workOrderChecklistItem.create({
        data: {
          workOrderId: id,
          label: dto.label,
          sortOrder: checklistItems.length + 1,
        },
      });
    });

    return this.buscarDetalhesPorId(id);
  }

  private async reordenarChecklist(
    workOrderId: string,
    tx: Prisma.TransactionClient,
  ) {
    const items = await tx.workOrderChecklistItem.findMany({
      where: { workOrderId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    await Promise.all(
      items.map((item, index) =>
        tx.workOrderChecklistItem.update({
          where: { id: item.id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );
  }

  async criarComentario(id: string, dto: CreateWorkOrderCommentDto) {
    const ordem = await this.buscarOrdemPorId(id);
    const autorId = this.obterUsuarioLogadoId();

    if (!autorId) {
      throw new BadRequestException('Usuário autenticado não encontrado.');
    }

    await this.prisma.workOrderComment.create({
      data: {
        workOrderId: ordem.id,
        authorId: autorId,
        text: dto.text.trim(),
      },
    });

    await this.workOrderActivityNotificationService.notifyNewComment({
      workOrderId: ordem.id,
      workOrderTitle: (ordem as any).title ?? `OS ${ordem.id}`,
      actorUserId: autorId,
      companyId: (ordem as any).companyId ?? this.obterCompanyId() ?? undefined,
      assigneeUserIds: ordem.assignees.map((assignee) => assignee.userId),
    });

    return this.buscarDetalhesPorId(ordem.id);
  }

  async adicionarEvidencia(id: string, file: any, description?: string) {
    const ordem = await this.buscarOrdemPorId(id);
    const usuario = this.obterUsuarioLogado();

    const arquivo = await this.filesService.uploadFile(
      file,
      FileType.DOCUMENT,
      usuario?.companyId,
      usuario?.id,
      description,
    );

    await this.prisma.workOrderEvidence.create({
      data: {
        workOrderId: ordem.id,
        fileId: arquivo.id,
        description,
      },
    });

    await this.registrarComentarioAutomatico(
      ordem.id,
      `Evidência adicionada: ${arquivo.originalName}.`,
    );

    return this.buscarDetalhesPorId(ordem.id);
  }

  protected async antesDeCriar(data: CreateWorkOrderDto): Promise<void> {
    const location = await this.buscarLocalidadeValida(data.locationId);
    await this.validarBloqueioPorOsAberta(
      data.locationId,
      data.type as 'CORRECTIVE' | 'PREVENTIVE',
      data.equipmentType,
    );

    const responsaveis = await this.resolverResponsaveisDoPayload(data);
    this.pendingCreateAssigneeIds = responsaveis.map(
      (responsavel) => responsavel.id,
    );

    delete (data as any).assignedToUserIds;

    if (data.planningId) {
      await this.validarPlanejamentoDisponivel(data.planningId, undefined, data.type);
    }

    if (this.pendingCreateAssigneeIds.length > 0 && !data.status) {
      data.status = WorkOrderStatus.ASSIGNED;
    }

    if (!data.status) {
      data.status = WorkOrderStatus.PENDING;
    }

    if (!data.columnId) {
      const defaultColumn = await this.obterColunaInicial(
        this.obterCompanyId() ?? undefined,
        location.regionalId ?? null,
      );
      if (defaultColumn) {
        data.columnId = defaultColumn.id;
      }
    }

    if (!data.slaDeadlineHours && data.dueDate) {
      data.slaDeadlineHours = this.calcularHorasRestantes(
        new Date(data.dueDate),
      );
    }

    data.slaStatus = this.calcularSlaStatus(
      data.dueDate ? new Date(data.dueDate) : null,
      data.status,
    );
  }

  private async validarBloqueioPorOsAberta(
    locationId: string,
    type: 'CORRECTIVE' | 'PREVENTIVE',
    equipmentType?: AssetType,
  ): Promise<void> {
    const tiposBloqueados = [
      WorkOrderType.CORRECTIVE,
      WorkOrderType.PREVENTIVE,
    ];

    if (!tiposBloqueados.includes(type)) {
      return;
    }

    const equipmentTypeLabel: Record<AssetType, string> = {
      CAMERA: 'câmera',
      ATDB: 'ATDB',
      PMV: 'PMV',
      OTHER: 'equipamento',
    };

    const companyId = this.obterCompanyId();
    const osAberta = await this.prisma.workOrder.findFirst({
      where: {
        deletedAt: null,
        locationId,
        type,
        ...(equipmentType && { equipmentType }),
        status: {
          notIn: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED],
        },
        ...(companyId ? { companyId } : {}),
      },
      select: {
        id: true,
      },
    });

    if (osAberta) {
      throw new BadRequestException(
        `Bloqueio: já existe uma OS ${
          type === WorkOrderType.CORRECTIVE ? 'corretiva' : 'preventiva'
        } em aberto para esta localidade para a ${equipmentTypeLabel[equipmentType ?? AssetType.OTHER]}. Conclua a OS atual deste equipamento na localidade antes de abrir outra.`,
      );
    }
  }

  protected async antesDeAtualizar(
    _id: string,
    data: UpdateWorkOrderDto,
  ): Promise<void> {
    this.pendingUpdateAssigneeIds = null;
    const companyId = this.obterCompanyId();
    const ordemAtual = await this.repository.buscarPrimeiro('workOrder', {
      id: _id,
      deletedAt: null,
      ...(companyId && { companyId }),
    });

    if (!ordemAtual) {
      throw new NotFoundException('Ordem de serviço não encontrada.');
    }

    if (data.locationId) {
      await this.buscarLocalidadeValida(data.locationId);
    }

    if (Object.prototype.hasOwnProperty.call(data as object, 'planningId')) {
      if (data.planningId) {
        await this.validarPlanejamentoDisponivel(
          data.planningId,
          _id,
          data.type,
        );
      }
    }

    const payloadPossuiLista = Object.prototype.hasOwnProperty.call(
      data as object,
      'assignedToUserIds',
    );

    if (payloadPossuiLista) {
      const responsaveis = await this.resolverResponsaveisDoPayload(data);
      this.pendingUpdateAssigneeIds = responsaveis.map(
        (responsavel) => responsavel.id,
      );
      delete (data as any).assignedToUserIds;
      if (!data.status) {
        if (
          ordemAtual.status === WorkOrderStatus.PENDING &&
          this.pendingUpdateAssigneeIds.length > 0
        ) {
          data.status = WorkOrderStatus.ASSIGNED;
        } else if (
          ordemAtual.status === WorkOrderStatus.ASSIGNED &&
          this.pendingUpdateAssigneeIds.length === 0
        ) {
          data.status = WorkOrderStatus.PENDING;
        }
      }
    }

    if (data.status === WorkOrderStatus.COMPLETED) {
      (data as any).completedAt = new Date();
      data.slaStatus = WorkOrderSlaStatus.OK;
      return;
    }

    if (
      data.status === WorkOrderStatus.IN_PROGRESS &&
      (ordemAtual.status === WorkOrderStatus.PENDING ||
        ordemAtual.status === WorkOrderStatus.ASSIGNED) &&
      !ordemAtual.startedAt
    ) {
      (data as any).startedAt = new Date();
    }

    if (
      data.status &&
      ordemAtual.status === WorkOrderStatus.COMPLETED
    ) {
      (data as any).completedAt = null;
    }

    if (data.dueDate || data.status) {
      data.slaStatus = this.calcularSlaStatus(
        data.dueDate ? new Date(data.dueDate) : null,
        data.status,
      );
    }
  }

  protected async depoisDeAtualizar(
    id: string,
    _data: UpdateWorkOrderDto,
  ): Promise<void> {
    if (this.pendingUpdateAssigneeIds === null) {
      return;
    }

    await this.sincronizarResponsaveis(id, this.pendingUpdateAssigneeIds);

    this.pendingUpdateAssigneeIds = null;
  }

  protected async depoisDeCriar(data: {
    id: string;
    type: WorkOrderType;
  }): Promise<void> {
    try {
      await this.sincronizarResponsaveis(
        data.id,
        this.pendingCreateAssigneeIds,
      );
      // await this.criarChecklistPadrao(data.id, data.type);
      await this.registrarComentarioAutomatico(data.id, 'OS criada.');

      if (this.pendingCreateAssigneeIds.length > 0) {
        const responsaveis = await this.prisma.user.findMany({
          where: { id: { in: this.pendingCreateAssigneeIds } },
          select: { name: true },
        });
        const nomes = responsaveis
          .map((responsavel) => responsavel.name)
          .filter(Boolean)
          .join(', ');

        await this.registrarComentarioAutomatico(
          data.id,
          `OS atribuída para: ${nomes}.`,
        );

        for (const assignedUserId of this.pendingCreateAssigneeIds) {
          await this.workOrderActivityNotificationService.notifyAssignment({
            workOrderId: data.id,
            workOrderTitle: `OS ${data.id}`,
            actorUserId: this.obterUsuarioLogadoId() ?? assignedUserId,
            companyId: this.obterCompanyId() ?? undefined,
            assignedUserId,
          });
        }
      }

      this.pendingCreateAssigneeIds = [];
    } catch (error) {
      console.error(
        '[WorkOrdersService] depoisDeCriar falhou',
        JSON.stringify({
          workOrderId: data.id,
          workOrderType: data.type,
          assignedToUserIds: this.pendingCreateAssigneeIds,
        }),
        error,
      );

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(
        `Falha ao inicializar checklist/comentários da ordem de serviço: ${errorMessage}`,
      );
    }
  }

  private async buscarOrdemPorId(id: string) {
    const companyId = this.obterCompanyId();
    const whereClause: Prisma.WorkOrderWhereInput = {
      id,
      deletedAt: null,
      ...(companyId && { companyId }),
    };

    const ordem = await this.prisma.workOrder.findFirst({
      where: whereClause,
      include: {
        assignees: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!ordem) {
      throw new NotFoundException('Ordem de serviço não encontrada.');
    }

    return ordem;
  }

  private async buscarResponsavelValido(userId: string) {
    const companyId = this.obterCompanyId();
    const responsavel = await this.prisma.user.findFirst({
      where: {
        id: userId,
        status: UserStatus.ACTIVE,
        role: { in: [Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C] },
        ...(companyId && { companyId }),
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!responsavel) {
      throw new NotFoundException('Responsável não encontrado ou inativo.');
    }

    return responsavel;
  }

  private async buscarLocalidadeValida(locationId: string) {
    const companyId = this.obterCompanyId();
    const location = await this.repository.buscarPrimeiro('location', {
      id: locationId,
      deletedAt: null,
      ...(companyId && { companyId }),
    });

    if (!location) {
      throw new NotFoundException('Localidade não encontrada.');
    }

    return location;
  }

  private async obterColunaInicial(
    companyId?: string,
    regionalId?: string | null,
  ) {
    if (!companyId) {
      return null;
    }

    return this.prisma.workOrderColumn.findFirst({
      where: {
        companyId,
        deletedAt: null,
        OR: [{ regionalId: null }, ...(regionalId ? [{ regionalId }] : [])],
      },
      orderBy: [{ regionalId: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
  }

  private async resolverResponsaveisDoPayload(
    data: Pick<CreateWorkOrderDto, 'assignedToUserIds'>,
  ) {
    const ids = Array.from(
      new Set(
        [...(data.assignedToUserIds ?? [])]
          .filter(Boolean)
          .map((value) => String(value).trim()),
      ),
    ).filter(Boolean);

    if (ids.length === 0) {
      return [];
    }

    const responsaveis = await Promise.all(
      ids.map((userId) => this.buscarResponsavelValido(userId)),
    );

    return responsaveis;
  }

  private async validarPlanejamentoDisponivel(
    planningId: string,
    workOrderIdPermitida?: string,
    workOrderType?: WorkOrderType,
  ) {
    const companyId = this.obterCompanyId();
    const planning = await this.prisma.planning.findFirst({
      where: {
        id: planningId,
        deletedAt: null,
        ...(companyId && { companyId }),
      },
      include: {
        workOrder: {
          select: { id: true },
        },
      },
    });

    if (!planning) {
      throw new NotFoundException('Planejamento não encontrado.');
    }

    if (
      planning.workOrder &&
      planning.workOrder.id !== workOrderIdPermitida
    ) {
      throw new BadRequestException(
        'Este planejamento já está associado a outra OS.',
      );
    }

    if (workOrderType && planning.serviceType !== workOrderType) {
      throw new BadRequestException(
        'O tipo da OS deve ser igual ao tipo do planejamento associado.',
      );
    }
  }

  private async sincronizarResponsaveis(
    workOrderId: string,
    userIds: string[],
  ) {
    await this.prisma.workOrderAssignee.deleteMany({
      where: { workOrderId },
    });

    if (userIds.length > 0) {
      await this.prisma.workOrderAssignee.createMany({
        data: userIds.map((userId) => ({
          workOrderId,
          userId,
        })),
      });
    }
  }

  private async registrarComentarioAutomatico(
    workOrderId: string,
    text: string,
  ): Promise<void> {
    const autorId = this.obterUsuarioLogadoId();

    if (!autorId) {
      return;
    }

    await this.repository.atualizar('workOrder', { id: workOrderId }, {
      comments: {
        create: {
          author: { connect: { id: autorId } },
          text,
        },
      },
    } as any);
  }

  private normalizarDetalhesDaOrdem<T>(ordem: T): T {
    if (!ordem || typeof ordem !== 'object') {
      return ordem;
    }

    const ordemNormalizada = ordem as T & {
      checklistItems?: unknown[];
      comments?: unknown[];
      evidences?: unknown[];
    };

    return {
      ...ordemNormalizada,
      checklistItems: Array.isArray(ordemNormalizada.checklistItems)
        ? ordemNormalizada.checklistItems
        : [],
      comments: Array.isArray(ordemNormalizada.comments)
        ? ordemNormalizada.comments
        : [],
      evidences: Array.isArray(ordemNormalizada.evidences)
        ? ordemNormalizada.evidences
        : [],
      workOrderPauseHistories: Array.isArray(
        (ordemNormalizada as any).workOrderPauseHistories,
      )
        ? (ordemNormalizada as any).workOrderPauseHistories
        : [],
    };
  }

  private calcularSlaStatus(
    dueDate?: Date | null,
    status?: WorkOrderStatus,
  ): WorkOrderSlaStatus {
    if (
      status === WorkOrderStatus.COMPLETED ||
      status === WorkOrderStatus.CANCELLED
    ) {
      return WorkOrderSlaStatus.OK;
    }

    if (!dueDate) {
      return WorkOrderSlaStatus.OK;
    }

    const horasRestantes = this.calcularHorasRestantes(dueDate);

    if (horasRestantes <= 0) {
      return WorkOrderSlaStatus.OVERDUE;
    }

    if (horasRestantes <= 6) {
      return WorkOrderSlaStatus.WARNING;
    }

    return WorkOrderSlaStatus.OK;
  }

  private calcularHorasRestantes(dueDate: Date): number {
    const diferenca = dueDate.getTime() - Date.now();
    return Math.ceil(diferenca / (1000 * 60 * 60));
  }
}
