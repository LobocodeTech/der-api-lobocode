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
  PlanningExecutionStatus,
  Prisma,
  Roles,
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
import { CompleteWorkOrderDto } from './dto/complete-work-order.dto';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { CreateWorkOrderCommentDto } from './dto/create-work-order-comment.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { UpdateWorkOrderChecklistItemDto } from './dto/update-work-order-checklist-item.dto';
import { CreateWorkOrderCheckListDto } from './dto/create-work-order-checklist-item.dto';
import { MoveWorkOrderColumnDto } from './dto/move-work-order-column.dto';
import {
  WorkOrderActivityNotificationService,
  type WorkOrderLifecycleEventKind,
} from '../notifications/shared/work-order-activity-notification.service';
import {
  WORK_ORDER_QUEUES_ON_WORK_ORDER_INCLUDE,
  WorkOrderQueueUsersService,
} from './work-order-queue-users/work-order-queue-users.service';
import {
  diaCivilParaDatePostgres,
  extrairDiaCivilDoPrazo,
  horasRestantesAteFimDoPrazo,
} from './utils/work-order-due-date.util';
import { formatAssetTypeLabel } from 'src/shared/common/utils/asset-type-label';
import {
  atribuirProximoNumeroSequencialWorkOrder,
  reordenarNumerosSequenciaisWorkOrder,
} from './utils/work-order-sequential-number.util';

@Injectable({ scope: Scope.REQUEST })
export class WorkOrdersService extends UniversalService<
  CreateWorkOrderDto,
  UpdateWorkOrderDto
> {
  private static readonly entityConfig = createEntityConfig('workOrder');
  private pendingCreateQueueIds: string[] | null = null;
  private pendingUpdateQueueIds: string[] | null = null;
  private pendingPreviousQueueIds: string[] | null = null;
  private pendingLifecycleEvent: WorkOrderLifecycleEventKind | null = null;
  private pendingLifecycleWorkOrderId: string | null = null;

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
            color: true,
            radiusKm: true,
          },
        },
      },
    },
    workOrderQueues: WORK_ORDER_QUEUES_ON_WORK_ORDER_INCLUDE,
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
    private readonly workOrderQueueUsersService: WorkOrderQueueUsersService,
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
                color: true,
                radiusKm: true,
              },
            },
          },
        },
        workOrderQueues: WORK_ORDER_QUEUES_ON_WORK_ORDER_INCLUDE,
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
    const normalizada = this.normalizarDetalhesDaOrdem(ordem);
    return this.mapWorkOrderResponse(normalizada);
  }

  async buscarDetalhesPorId(id: string) {
    return this.buscarPorId(id, this.detalhesInclude);
  }

  async buscarTodos() {
    const resultado = await super.buscarTodos();
    return this.mapWorkOrderResponse(resultado);
  }

  async buscarComPaginacao(page = 1, limit = 20, include?: any) {
    const resultado = await super.buscarComPaginacao(page, limit, include);
    return this.mapWorkOrderResponse(resultado);
  }

  async buscarPorCampo(field: string, value: any, include?: any) {
    const resultado = await super.buscarPorCampo(field, value, include);
    return this.mapWorkOrderResponse(resultado);
  }

  async buscarMuitosPorCampo(field: string, value: any, include?: any) {
    const resultado = await super.buscarMuitosPorCampo(field, value, include);
    return this.mapWorkOrderResponse(resultado);
  }

  async criar(data: CreateWorkOrderDto, include?: any, role?: Roles) {
    const entity = await super.criar(data, include, role);
    return this.mapWorkOrderResponse(entity);
  }

  async atualizar(id: string, dto: UpdateWorkOrderDto, include?: any) {
    const entity = await super.atualizar(id, dto, include);
    return this.mapWorkOrderResponse(entity);
  }

  async buscarPorLocalidade(locationId: string) {
    await this.buscarLocalidadeValida(locationId);
    return this.buscarMuitosPorCampo('locationId', locationId);
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
    const companyId = (ordem as { companyId?: string }).companyId ?? this.obterCompanyId();
    const recipientIds =
      await this.workOrderQueueUsersService.resolveUserIdsFromWorkOrderId(
        ordem.id,
        companyId ?? undefined,
      );

    if (recipientIds.length === 0) {
      throw new BadRequestException(
        'A ordem de serviço precisa ter ao menos uma fila com membros antes de iniciar.',
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

    await this.notificarEventoCicloDeVida(ordem.id, 'started', recipientIds);

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

    await this.concluirPlanejamentoVinculadoAoFinalizarOs(ordem.id);

    const companyId =
      (ordem as { companyId?: string }).companyId ?? this.obterCompanyId();
    const recipientIds =
      await this.workOrderQueueUsersService.resolveUserIdsFromWorkOrderId(
        ordem.id,
        companyId ?? undefined,
      );
    await this.notificarEventoCicloDeVida(ordem.id, 'completed', recipientIds);

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

    if (novoStatus === WorkOrderStatus.COMPLETED) {
      await this.concluirPlanejamentoVinculadoAoFinalizarOs(ordem.id);
    }

    if (novoStatus !== ordem.status) {
      const companyId = ordem.companyId ?? this.obterCompanyId();
      const recipientIds =
        await this.workOrderQueueUsersService.resolveUserIdsFromWorkOrderId(
          ordem.id,
          companyId ?? undefined,
        );
      if (novoStatus === WorkOrderStatus.IN_PROGRESS) {
        await this.notificarEventoCicloDeVida(ordem.id, 'started', recipientIds);
      } else if (novoStatus === WorkOrderStatus.COMPLETED) {
        await this.notificarEventoCicloDeVida(
          ordem.id,
          'completed',
          recipientIds,
        );
      }
    }

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
      assigneeUserIds:
        await this.workOrderQueueUsersService.resolveUserIdsFromWorkOrderId(
          ordem.id,
          (ordem as { companyId?: string }).companyId ??
            this.obterCompanyId() ??
            undefined,
        ),
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

    const companyId = this.obterCompanyId();
    const queueIds = this.workOrderQueueUsersService.normalizarQueueIds(
      Object.prototype.hasOwnProperty.call(data as object, 'queueIds')
        ? data.queueIds
        : [],
    );
    if (companyId && queueIds.length > 0) {
      await this.workOrderQueueUsersService.validarFilasDaEmpresa(
        queueIds,
        companyId,
      );
    }
    this.pendingCreateQueueIds = queueIds;
    delete (data as any).queueIds;

    if (data.planningId) {
      await this.validarPlanejamentoDisponivel(data.planningId, undefined, data.type);
    }

    if (queueIds.length > 0 && !data.status) {
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

    if (data.dueDate) {
      const dia = extrairDiaCivilDoPrazo(String(data.dueDate));
      if (dia) {
        const dbDate = diaCivilParaDatePostgres(dia);
        (data as { dueDate?: Date }).dueDate = dbDate;
      } else {
        delete (data as { dueDate?: unknown }).dueDate;
      }
    } else {
      delete (data as { dueDate?: unknown }).dueDate;
    }

    if (!data.slaDeadlineHours && (data as { dueDate?: Date }).dueDate) {
      const horas = horasRestantesAteFimDoPrazo(
        (data as { dueDate?: Date }).dueDate,
      );
      if (horas != null) {
        data.slaDeadlineHours = horas;
      }
    }

    data.slaStatus = this.calcularSlaStatus(
      (data as { dueDate?: Date }).dueDate ?? null,
      data.status,
    );

    const empresaId = data.companyId ?? companyId;
    if (!empresaId) {
      throw new BadRequestException(
        'Empresa não identificada para gerar o número sequencial da OS.',
      );
    }
    delete (data as { sequentialNumber?: unknown }).sequentialNumber;
    const proximoNumero = await this.prisma.$transaction((tx) =>
      atribuirProximoNumeroSequencialWorkOrder(tx, empresaId),
    );
    (data as CreateWorkOrderDto & { sequentialNumber: string }).sequentialNumber =
      proximoNumero;
  }

  private async validarBloqueioPorOsAberta(
    locationId: string,
    type: 'CORRECTIVE' | 'PREVENTIVE',
    equipmentType?: AssetType,
    excludeWorkOrderId?: string,
  ): Promise<void> {
    const tiposBloqueados = [
      WorkOrderType.CORRECTIVE,
      WorkOrderType.PREVENTIVE,
    ];

    if (!tiposBloqueados.includes(type)) {
      return;
    }

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
        ...(excludeWorkOrderId ? { id: { not: excludeWorkOrderId } } : {}),
      },
      select: {
        id: true,
      },
    });

    if (osAberta) {
      throw new BadRequestException(
        `Bloqueio: já existe uma OS ${
          type === WorkOrderType.CORRECTIVE ? 'corretiva' : 'preventiva'
        } em aberto para esta localidade para ${formatAssetTypeLabel(equipmentType ?? AssetType.OTHER)}. Conclua a OS atual deste equipamento na localidade antes de abrir outra.`,
      );
    }
  }

  protected async antesDeAtualizar(
    _id: string,
    data: UpdateWorkOrderDto,
  ): Promise<void> {
    delete (data as { sequentialNumber?: unknown }).sequentialNumber;
    this.pendingUpdateQueueIds = null;
    this.pendingPreviousQueueIds = null;
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

    const mudouLocalidade =
      data.locationId !== undefined &&
      data.locationId !== ordemAtual.locationId;
    const mudouEquipamento = Object.prototype.hasOwnProperty.call(
      data as object,
      'equipmentType',
    );
    const equipmentTypePayload = mudouEquipamento
      ? ((data as { equipmentType?: AssetType | null }).equipmentType ?? null)
      : undefined;
    const mudouValorEquipamento =
      mudouEquipamento &&
      equipmentTypePayload !== (ordemAtual.equipmentType ?? null);
    const mudouTipo =
      data.type !== undefined && data.type !== ordemAtual.type;

    if (mudouLocalidade || mudouValorEquipamento || mudouTipo) {
      const locationIdEfetivo =
        data.locationId !== undefined ? data.locationId : ordemAtual.locationId;
      const tipoEfetivo =
        data.type !== undefined ? data.type : ordemAtual.type;
      const equipmentEfetivo = mudouEquipamento
        ? (equipmentTypePayload ?? undefined)
        : (ordemAtual.equipmentType ?? undefined);
      await this.validarBloqueioPorOsAberta(
        locationIdEfetivo,
        tipoEfetivo as 'CORRECTIVE' | 'PREVENTIVE',
        equipmentEfetivo,
        _id,
      );
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

    const companyIdUpdate = this.obterCompanyId();

    if (Object.prototype.hasOwnProperty.call(data as object, 'queueIds')) {
      this.pendingPreviousQueueIds =
        await this.workOrderQueueUsersService.resolveQueueIdsFromWorkOrderId(
          _id,
        );

      const queueIds = this.workOrderQueueUsersService.normalizarQueueIds(
        (data as CreateWorkOrderDto).queueIds,
      );
      if (companyIdUpdate && queueIds.length > 0) {
        await this.workOrderQueueUsersService.validarFilasDaEmpresa(
          queueIds,
          companyIdUpdate,
        );
      }
      this.pendingUpdateQueueIds = queueIds;
      delete (data as any).queueIds;

      if (!data.status) {
        if (
          ordemAtual.status === WorkOrderStatus.PENDING &&
          queueIds.length > 0
        ) {
          data.status = WorkOrderStatus.ASSIGNED;
        } else if (
          ordemAtual.status === WorkOrderStatus.ASSIGNED &&
          queueIds.length === 0
        ) {
          data.status = WorkOrderStatus.PENDING;
        }
      }
    }

    if (data.status !== undefined && data.status !== ordemAtual.status) {
      if (data.status === WorkOrderStatus.PAUSED) {
        this.pendingLifecycleEvent = 'paused';
        this.pendingLifecycleWorkOrderId = _id;
      } else if (
        data.status === WorkOrderStatus.IN_PROGRESS &&
        ordemAtual.status === WorkOrderStatus.PAUSED
      ) {
        this.pendingLifecycleEvent = 'resumed';
        this.pendingLifecycleWorkOrderId = _id;
      } else if (data.status === WorkOrderStatus.IN_PROGRESS) {
        this.pendingLifecycleEvent = 'started';
        this.pendingLifecycleWorkOrderId = _id;
      } else if (data.status === WorkOrderStatus.COMPLETED) {
        this.pendingLifecycleEvent = 'completed';
        this.pendingLifecycleWorkOrderId = _id;
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

    const dueDateNoPayload = Object.prototype.hasOwnProperty.call(
      data as object,
      'dueDate',
    );

    if (dueDateNoPayload) {
      if (data.dueDate === null || data.dueDate === '') {
        (data as { dueDate: Date | null }).dueDate = null;
        (data as { slaDeadlineHours?: number | null }).slaDeadlineHours = null;
      } else if (typeof data.dueDate === 'string') {
        const dia = extrairDiaCivilDoPrazo(data.dueDate);
        const dbDate = dia ? diaCivilParaDatePostgres(dia) : null;
        (data as { dueDate: Date | null }).dueDate = dbDate;
        if (!dbDate) {
          (data as { slaDeadlineHours?: number | null }).slaDeadlineHours = null;
        }
      }

      if ((data as { dueDate?: Date | null }).dueDate) {
        const horas = horasRestantesAteFimDoPrazo(
          (data as { dueDate?: Date | null }).dueDate,
        );
        if (horas != null) {
          (data as { slaDeadlineHours?: number }).slaDeadlineHours = horas;
        }
      }
    }

    if (dueDateNoPayload || data.status !== undefined) {
      const effectiveDue = dueDateNoPayload
        ? ((data as { dueDate?: Date | null }).dueDate ?? null)
        : ((ordemAtual as { dueDate?: Date | null }).dueDate ?? null);
      const effectiveStatus =
        data.status !== undefined ? data.status : ordemAtual.status;
      data.slaStatus = this.calcularSlaStatus(effectiveDue, effectiveStatus);
    }
  }

  protected async depoisDeAtualizar(
    id: string,
    _data: UpdateWorkOrderDto,
  ): Promise<void> {
    await this.concluirPlanejamentoVinculadoAoFinalizarOs(id);

    if (this.pendingUpdateQueueIds !== null) {
      await this.sincronizarFilas(id, this.pendingUpdateQueueIds);
      await this.notificarMudancasFilasNaOs(
        id,
        this.pendingPreviousQueueIds ?? [],
        this.pendingUpdateQueueIds,
      );
      this.pendingPreviousQueueIds = null;
      this.pendingUpdateQueueIds = null;
    }

    if (this.pendingLifecycleEvent && this.pendingLifecycleWorkOrderId) {
      const recipientIds =
        await this.workOrderQueueUsersService.resolveUserIdsFromWorkOrderId(
          this.pendingLifecycleWorkOrderId,
          this.obterCompanyId() ?? undefined,
        );
      await this.notificarEventoCicloDeVida(
        this.pendingLifecycleWorkOrderId,
        this.pendingLifecycleEvent,
        recipientIds,
      );
      this.pendingLifecycleEvent = null;
      this.pendingLifecycleWorkOrderId = null;
    }
  }

  protected async depoisDeCriar(data: {
    id: string;
    type: WorkOrderType;
  }): Promise<void> {
    try {
      const queueIds = this.pendingCreateQueueIds ?? [];
      await this.sincronizarFilas(data.id, queueIds);
      // await this.criarChecklistPadrao(data.id, data.type);
      await this.registrarComentarioAutomatico(data.id, 'OS criada.');

      const ordemCriada = await this.prisma.workOrder.findUnique({
        where: { id: data.id },
        select: { title: true, companyId: true },
      });
      const workOrderTitle =
        ordemCriada?.title?.trim() || `OS ${data.id}`;
      const companyId =
        ordemCriada?.companyId ?? this.obterCompanyId() ?? undefined;
      const actorUserId = this.obterUsuarioLogadoId() ?? 'system';

      if (companyId) {
        await this.workOrderActivityNotificationService.notifyOnCreate({
          workOrderId: data.id,
          workOrderTitle,
          actorUserId,
          companyId,
        });
      }

      if (queueIds.length > 0) {
        const filas = await this.prisma.queue.findMany({
          where: { id: { in: queueIds } },
          select: { title: true },
        });
        const titulos = filas.map((fila) => fila.title).filter(Boolean).join(', ');
        await this.registrarComentarioAutomatico(
          data.id,
          `OS associada às filas: ${titulos}.`,
        );
        await this.notificarMudancasFilasNaOs(data.id, [], queueIds);
      }

      this.pendingCreateQueueIds = null;
    } catch (error) {
      console.error(
        '[WorkOrdersService] depoisDeCriar falhou',
        JSON.stringify({
          workOrderId: data.id,
          workOrderType: data.type,
          queueIds: this.pendingCreateQueueIds,
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
        workOrderQueues: WORK_ORDER_QUEUES_ON_WORK_ORDER_INCLUDE,
      },
    });

    if (!ordem) {
      throw new NotFoundException('Ordem de serviço não encontrada.');
    }

    return ordem;
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

  private async sincronizarFilas(workOrderId: string, queueIds: string[]) {
    await this.prisma.workOrderQueue.deleteMany({
      where: { workOrderId },
    });

    if (queueIds.length > 0) {
      await this.prisma.workOrderQueue.createMany({
        data: queueIds.map((queueId) => ({
          workOrderId,
          queueId,
        })),
      });
    }
  }

  private async notificarMudancasFilasNaOs(
    workOrderId: string,
    previousQueueIds: string[],
    nextQueueIds: string[],
  ): Promise<void> {
    const { added, removed } = this.workOrderQueueUsersService.diffQueueIds(
      previousQueueIds,
      nextQueueIds,
    );
    if (added.length === 0 && removed.length === 0) {
      return;
    }

    const ordem = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, deletedAt: null },
      select: { title: true, companyId: true },
    });
    if (!ordem) return;

    const workOrderTitle = ordem.title?.trim() || `OS ${workOrderId}`;
    const companyId = ordem.companyId ?? this.obterCompanyId() ?? undefined;
    const actorUserId = this.obterUsuarioLogadoId() ?? 'system';

    const queueIds = [...added, ...removed];
    const filas = await this.prisma.queue.findMany({
      where: { id: { in: queueIds } },
      select: { id: true, title: true },
    });
    const tituloPorId = new Map(filas.map((fila) => [fila.id, fila.title]));

    for (const queueId of added) {
      const usuarios =
        await this.workOrderQueueUsersService.resolveUsersFromQueueIds(
          [queueId],
          companyId,
        );
      const queueTitle = tituloPorId.get(queueId) ?? 'Fila';
      for (const user of usuarios) {
        if (user.id === actorUserId) continue;
        await this.workOrderActivityNotificationService.notifyAssignmentViaQueue(
          {
            workOrderId,
            workOrderTitle,
            queueTitle,
            actorUserId,
            companyId,
            assignedUserId: user.id,
          },
        );
      }
    }

    for (const queueId of removed) {
      const usuarios =
        await this.workOrderQueueUsersService.resolveUsersFromQueueIds(
          [queueId],
          companyId,
        );
      const queueTitle = tituloPorId.get(queueId) ?? 'Fila';
      for (const user of usuarios) {
        if (user.id === actorUserId) continue;
        await this.workOrderActivityNotificationService.notifyUnassignmentViaQueue(
          {
            workOrderId,
            workOrderTitle,
            queueTitle,
            actorUserId,
            companyId,
            removedUserId: user.id,
          },
        );
      }
    }
  }

  private async notificarEventoCicloDeVida(
    workOrderId: string,
    kind: WorkOrderLifecycleEventKind,
    recipientUserIds: string[],
  ): Promise<void> {
    const ordem = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, deletedAt: null },
      select: { title: true, companyId: true },
    });
    if (!ordem) return;

    const actorUserId = this.obterUsuarioLogadoId() ?? 'system';
    await this.workOrderActivityNotificationService.notifyAssigneesAboutEvent({
      workOrderId,
      workOrderTitle: ordem.title?.trim() || `OS ${workOrderId}`,
      actorUserId,
      companyId: ordem.companyId ?? this.obterCompanyId() ?? undefined,
      recipientUserIds,
      kind,
    });
  }

  protected async depoisDeDesativar(id: string): Promise<void> {
    const ordem = await this.prisma.workOrder.findFirst({
      where: { id },
      select: { companyId: true },
    });

    if (ordem?.companyId) {
      await this.prisma.$transaction((tx) =>
        reordenarNumerosSequenciaisWorkOrder(tx, ordem.companyId),
      );
    }

    const companyId = this.obterCompanyId() ?? ordem?.companyId;
    const recipientIds =
      await this.workOrderQueueUsersService.resolveUserIdsFromWorkOrderId(
        id,
        companyId ?? undefined,
      );
    await this.notificarEventoCicloDeVida(id, 'deleted', recipientIds);
  }

  private mapWorkOrderResponse<T>(resposta: T): T {
    if (!resposta || typeof resposta !== 'object') {
      return resposta;
    }

    const respostaObj = resposta as Record<string, unknown>;
    if ('data' in respostaObj) {
      const dados = respostaObj.data;
      if (Array.isArray(dados)) {
        return {
          ...respostaObj,
          data: dados.map((item) => this.mapWorkOrderEntity(item)),
        } as T;
      }
      if (dados && typeof dados === 'object') {
        return {
          ...respostaObj,
          data: this.mapWorkOrderEntity(dados),
        } as T;
      }
    }

    if (Array.isArray(resposta)) {
      return resposta.map((item) =>
        this.mapWorkOrderEntity(item),
      ) as unknown as T;
    }

    return this.mapWorkOrderEntity(resposta) as T;
  }

  private mapWorkOrderEntity(entity: unknown): unknown {
    if (!entity || typeof entity !== 'object') {
      return entity;
    }

    const record = entity as Record<string, unknown>;
    if (typeof record.id !== 'string') {
      return entity;
    }

    const workOrderQueues = (record.workOrderQueues ?? []) as Parameters<
      WorkOrderQueueUsersService['mapQueuesToResponse']
    >[0];
    const queues =
      this.workOrderQueueUsersService.mapQueuesToResponse(workOrderQueues);
    const users =
      this.workOrderQueueUsersService.mapAssigneesFromQueues(queues);
    const assignees =
      this.workOrderQueueUsersService.mapAssigneesPrismaShape(users);

    const { workOrderQueues: _removed, ...rest } = record;
    return {
      ...rest,
      queues,
      assignees,
    };
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

    const horasRestantes = horasRestantesAteFimDoPrazo(dueDate);
    if (horasRestantes == null) {
      return WorkOrderSlaStatus.OK;
    }

    if (horasRestantes <= 0) {
      return WorkOrderSlaStatus.OVERDUE;
    }

    if (horasRestantes <= 6) {
      return WorkOrderSlaStatus.WARNING;
    }

    return WorkOrderSlaStatus.OK;
  }

  /** Planejamento vinculado à OS passa a COMPLETED quando a OS fica concluída. */
  private async concluirPlanejamentoVinculadoAoFinalizarOs(
    workOrderId: string,
  ): Promise<void> {
    const ordem = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, deletedAt: null },
      select: { status: true },
    });
    if (!ordem || ordem.status !== WorkOrderStatus.COMPLETED) {
      return;
    }

    await this.prisma.planning.updateMany({
      where: {
        deletedAt: null,
        executionStatus: PlanningExecutionStatus.PENDING,
        workOrder: { id: workOrderId },
      },
      data: {
        executionStatus: PlanningExecutionStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }
}
