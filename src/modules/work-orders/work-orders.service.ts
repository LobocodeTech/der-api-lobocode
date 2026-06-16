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
  WorkOrderCorrectiveSlaStatus,
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
import { RejectWorkOrderCompletionDto } from './dto/reject-work-order-completion.dto';
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
  construirWorkOrderQueuesOnWorkOrderInclude,
  WorkOrderQueueUsersService,
} from './work-order-queue-users/work-order-queue-users.service';
import { formatAssetTypeLabel } from 'src/shared/common/utils/asset-type-label';
import { atribuirProximoNumeroSequencialWorkOrder } from './utils/work-order-sequential-number.util';
import { WorkOrderSlaService } from './services/work-order-sla.service';
import { GeneralPreventiveSlaService } from './services/general-preventive-sla.service';
import { WorkOrderCorrectiveSlaNotificationService } from './services/work-order-corrective-sla-notification.service';
import {
  desempacotarJanelaSla,
  empacotarJanelaSla,
  normalizarConfigSlaEmpresa,
  resolverConfigSlaDaOrdem,
  type CorrectiveSlaCompanyConfig,
  type CorrectiveSlaOrderSnapshot,
} from './utils/work-order-corrective-sla.util';
import {
  diaCivilParaDatePostgres,
  extrairDiaCivilDoPrazo,
} from './utils/work-order-due-date.util';
import { calcularSlaNegativoCorretiva } from './utils/work-order-negative-sla.util';
import { WORK_ORDER_AUDIT_USER_INCLUDE } from './dto/work-order-audit.fields';

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
  private cachedCompanySlaConfig: CorrectiveSlaCompanyConfig | null = null;
  /** TEMPORÁRIO: sem e-mail nas notificações de OS (WebSocket + push ativos). */
  private readonly omitirEmailNasNotificacoesOs = true;

  private construirDetalhesInclude(): Prisma.WorkOrderInclude {
    const companyId = this.obterCompanyId();
    return {
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
          },
        },
      },
    },
    workOrderQueues: construirWorkOrderQueuesOnWorkOrderInclude(companyId ?? undefined),
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
    ...WORK_ORDER_AUDIT_USER_INCLUDE,
    };
  }

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
    private readonly workOrderSlaService: WorkOrderSlaService,
    private readonly generalPreventiveSlaService: GeneralPreventiveSlaService,
    private readonly workOrderCorrectiveSlaNotificationService: WorkOrderCorrectiveSlaNotificationService,
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
        ...WORK_ORDER_AUDIT_USER_INCLUDE,
      },
      where: {
        deletedAt: null,
        ...(companyId && { companyId }),
      },
      orderBy: { createdAt: 'desc' },
    };
  }

  protected getIncludeConfig(): any {
    const companyId = this.obterCompanyId();
    const base = this.entityConfig.includes ?? {};
    return {
      ...base,
      workOrderQueues: construirWorkOrderQueuesOnWorkOrderInclude(companyId ?? undefined),
    };
  }

  private async preloadCompanySlaConfig(): Promise<void> {
    const companyId = this.obterCompanyId();
    if (companyId) {
      await this.obterConfigSlaEmpresa(companyId);
    }
  }

  async buscarPorId(id: string, include?: Prisma.WorkOrderInclude) {
    await this.preloadCompanySlaConfig();
    const ordem = await super.buscarPorId(id, include ?? this.construirDetalhesInclude());
    const normalizada = this.normalizarDetalhesDaOrdem(ordem);
    return this.mapWorkOrderResponse(normalizada);
  }

  async buscarDetalhesPorId(id: string) {
    return this.buscarPorId(id, this.construirDetalhesInclude());
  }

  async buscarTodos() {
    await this.preloadCompanySlaConfig();
    const resultado = await super.buscarTodos();
    return this.mapWorkOrderResponse(resultado);
  }

  async buscarComPaginacao(page = 1, limit = 20, include?: any) {
    await this.preloadCompanySlaConfig();
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

  private async validarFilasAssociadasParaIniciar(workOrderId: string): Promise<void> {
    const filasNaOs = await this.prisma.workOrderQueue.count({
      where: { workOrderId },
    });
    if (filasNaOs === 0) {
      throw new BadRequestException(
        'A ordem de serviço precisa estar associada a ao menos uma fila antes de entrar em andamento.',
      );
    }
  }

  async iniciarTrabalho(id: string) {
    const roleUser = this.obterUsuarioLogado()?.role;

    if(roleUser !== Roles.FIELD_TEAM) {
      throw new BadRequestException(
        'Você não tem permissão para iniciar uma ordem de serviço. Apenas usuários Técnicos do Campo.',
      );
    }

    const ordem = await this.buscarOrdemPorId(id);
    await this.validarFilasAssociadasParaIniciar(ordem.id);
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

    if (ordem.status === WorkOrderStatus.IN_PROGRESS) {
      return this.buscarDetalhesPorId(ordem.id);
    }

    if (
      ordem.status !== WorkOrderStatus.PENDING &&
      ordem.status !== WorkOrderStatus.ASSIGNED
    ) {
      throw new BadRequestException(
        'A OS só pode ser iniciada a partir dos status pendente/atribuída.',
      );
    }

    const agoraInicio = new Date();
    const updateData: Prisma.WorkOrderUpdateInput = {
      status: WorkOrderStatus.IN_PROGRESS,
      startedAt: ordem.startedAt ?? agoraInicio,
      completedAt: null,
      ...this.dadosAuditoriaAtualizacaoPrisma(this.obterUsuarioLogadoId()),
    };

    if (ordem.type === WorkOrderType.CORRECTIVE) {
      const estado = this.mapearEstadoSlaCorretiva(ordem);
      if (!estado.slaStartAt) {
        const config = await this.obterConfigSlaEmpresa(ordem.companyId);
        const init = this.workOrderSlaService.inicializarSlaNaCriacao(
          ordem.createdAt ?? agoraInicio,
          config,
        );
        Object.assign(updateData, init);
      } else {
        const config = await this.resolverConfigSlaDaOrdem(ordem);
        const snapshot = this.workOrderSlaService.calcularSnapshot(
          { ...estado, status: WorkOrderStatus.IN_PROGRESS },
          config,
          agoraInicio,
        );
        if (snapshot) {
          updateData.slaPausedAt = null;
          updateData.slaResumedAt = null;
          updateData.slaConsumedSeconds = snapshot.slaConsumedSeconds;
          if (snapshot.slaExceededAt) {
            updateData.slaExceededAt = snapshot.slaExceededAt;
          }
          if (snapshot.slaStatusExtended) {
            updateData.slaStatusExtended = snapshot.slaStatusExtended;
          }
          if (snapshot.slaDeadlineAt) {
            updateData.slaDeadlineAt = snapshot.slaDeadlineAt;
          }
          if (snapshot.slaRemainingSeconds != null) {
            updateData.slaRemainingSeconds = snapshot.slaRemainingSeconds;
          }
        }
        this.aplicarJanelaSlaEmpacotadaSeAusente(updateData, ordem, config);
      }
      this.aplicarSlaStatusNuloParaCorretiva(updateData);
    }

    await this.prisma.workOrder.update({
      where: { id: ordem.id },
      data: updateData,
    });

    await this.registrarComentarioAutomatico(
      ordem.id,
      'Trabalho iniciado na ordem de serviço.',
    );

    await this.notificarEventoCicloDeVida(ordem.id, 'started', recipientIds, {
      skipEmail: this.omitirEmailNasNotificacoesOs,
    });

    return this.buscarDetalhesPorId(ordem.id);
  }

  async concluirOrdem(id: string, dto: CompleteWorkOrderDto) {
    const ordem = await this.buscarOrdemPorId(id);
    const roleUser = this.obterUsuarioLogado()?.role;

    if (ordem.status === WorkOrderStatus.COMPLETED) {
      throw new BadRequestException('A ordem de serviço já foi concluída.');
    }

    if (ordem.status === WorkOrderStatus.COMPLETED_UNDER_REVIEW) {
      throw new BadRequestException(
        'A ordem de serviço já foi enviada para análise.',
      );
    }

    const completedAt = new Date();

    if (ordem.type === WorkOrderType.CORRECTIVE) {
      if (roleUser !== Roles.FIELD_TEAM) {
        throw new BadRequestException(
          'Apenas técnicos de campo podem concluir OS corretivas.',
        );
      }
      if (ordem.status !== WorkOrderStatus.IN_PROGRESS) {
        throw new BadRequestException(
          'A OS corretiva só pode ser concluída com status em andamento.',
        );
      }
      await this.prisma.workOrder.update({
        where: { id: ordem.id },
        data: {
          status: WorkOrderStatus.COMPLETED_UNDER_REVIEW,
          completedAt,
          ...this.dadosAuditoriaAtualizacaoPrisma(this.obterUsuarioLogadoId()),
        },
      });
      const comentario = dto.resolutionNotes?.trim()
        ? `OS concluída pelo técnico e enviada para análise. ${dto.resolutionNotes.trim()}`
        : 'OS concluída pelo técnico e enviada para análise.';
      await this.registrarComentarioAutomatico(ordem.id, comentario);
      const companyId =
        (ordem as { companyId?: string }).companyId ?? this.obterCompanyId();
      const recipientIds = await this.resolverDestinatariosAdminC2c(
        companyId ?? '',
      );
      await this.notificarEventoCicloDeVida(
        ordem.id,
        'submitted_for_review',
        recipientIds,
        { skipEmail: this.omitirEmailNasNotificacoesOs },
      );
      return this.buscarDetalhesPorId(ordem.id);
    }

    await this.executarConclusaoDefinitiva(ordem, completedAt, dto);
    return this.buscarDetalhesPorId(ordem.id);
  }

  async aprovarConclusaoOrdem(id: string, dto?: CompleteWorkOrderDto) {
    this.validarPermissaoAprovacaoConclusao();
    const ordem = await this.buscarOrdemPorId(id);
    if (ordem.type !== WorkOrderType.CORRECTIVE) {
      throw new BadRequestException(
        'A aprovação de conclusão é exclusiva para OS corretivas.',
      );
    }
    if (ordem.status !== WorkOrderStatus.COMPLETED_UNDER_REVIEW) {
      throw new BadRequestException(
        'A OS precisa estar em análise para ser aprovada.',
      );
    }
    const finalApprovalCompletedAt = new Date();
    await this.executarConclusaoDefinitiva(
      ordem,
      finalApprovalCompletedAt,
      dto,
      {
        finalApprovalCompletedAt,
        fromReview: true,
      },
    );
    return this.buscarDetalhesPorId(ordem.id);
  }

  async reprovarConclusaoOrdem(
    id: string,
    dto: RejectWorkOrderCompletionDto,
  ) {
    this.validarPermissaoAprovacaoConclusao();
    const ordem = await this.buscarOrdemPorId(id);
    if (ordem.type !== WorkOrderType.CORRECTIVE) {
      throw new BadRequestException(
        'A reprovação de conclusão é exclusiva para OS corretivas.',
      );
    }
    if (ordem.status !== WorkOrderStatus.COMPLETED_UNDER_REVIEW) {
      throw new BadRequestException(
        'A OS precisa estar em análise para ser reprovada.',
      );
    }
    const motivo = dto.reason.trim();
    await this.prisma.workOrder.update({
      where: { id: ordem.id },
      data: {
        status: WorkOrderStatus.IN_PROGRESS,
        completedAt: null,
        finalApprovalCompletedAt: null,
        ...this.dadosAuditoriaAtualizacaoPrisma(this.obterUsuarioLogadoId()),
      },
    });
    await this.registrarComentarioAutomatico(
      ordem.id,
      `OS reprovada durante análise. Motivo: ${motivo}`,
    );
    const companyId =
      (ordem as { companyId?: string }).companyId ?? this.obterCompanyId();
    const recipientIds =
      await this.workOrderQueueUsersService.resolveUserIdsFromWorkOrderId(
        ordem.id,
        companyId ?? undefined,
      );
    await this.notificarEventoCicloDeVida(ordem.id, 'rejected', recipientIds, {
      skipEmail: this.omitirEmailNasNotificacoesOs,
      rejectionReason: motivo,
    });
    return this.buscarDetalhesPorId(ordem.id);
  }

  private validarPermissaoAprovacaoConclusao(): void {
    const roleUser = this.obterUsuarioLogado()?.role;
    if (roleUser !== Roles.ADMIN && roleUser !== Roles.C2C) {
      throw new BadRequestException(
        'Você não tem permissão para aprovar ou reprovar conclusões de OS.',
      );
    }
  }

  private async resolverDestinatariosAdminC2c(
    companyId: string,
  ): Promise<string[]> {
    if (!companyId) {
      return [];
    }
    const usuarios = await this.prisma.user.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
        deletedAt: null,
        role: { in: [Roles.ADMIN, Roles.C2C] },
      },
      select: { id: true },
    });
    return usuarios.map((usuario) => usuario.id);
  }

  private resolverStatusConclusaoPorTipo(
    type: WorkOrderType,
  ): WorkOrderStatus {
    return type === WorkOrderType.CORRECTIVE
      ? WorkOrderStatus.COMPLETED_UNDER_REVIEW
      : WorkOrderStatus.COMPLETED;
  }

  private async executarConclusaoDefinitiva(
    ordem: {
      id: string;
      type: WorkOrderType;
      status: WorkOrderStatus;
      companyId: string;
      completedAt?: Date | null;
      slaStartAt?: Date | null;
      slaPausedAt?: Date | null;
      slaResumedAt?: Date | null;
      slaConsumedSeconds?: number | null;
      slaDeadlineAt?: Date | null;
      slaStatusExtended?: WorkOrderCorrectiveSlaStatus | null;
      slaExceededAt?: Date | null;
      finalApprovalCompletedAt?: Date | null;
    },
    agora: Date,
    dto?: CompleteWorkOrderDto,
    opcoes?: {
      finalApprovalCompletedAt?: Date;
      fromReview?: boolean;
    },
  ): Promise<void> {
    const finalApprovalCompletedAt =
      opcoes?.finalApprovalCompletedAt ??
      (ordem.type === WorkOrderType.CORRECTIVE ? agora : null);
    const updateData: Prisma.WorkOrderUpdateInput = {
      status: WorkOrderStatus.COMPLETED,
      completedAt: ordem.completedAt ?? agora,
      finalApprovalCompletedAt:
        ordem.type === WorkOrderType.CORRECTIVE ? finalApprovalCompletedAt : null,
      ...this.dadosAuditoriaAtualizacaoPrisma(this.obterUsuarioLogadoId()),
    };
    if (ordem.type === WorkOrderType.CORRECTIVE) {
      const config = await this.resolverConfigSlaDaOrdem(ordem);
      const slaEndAt = finalApprovalCompletedAt ?? agora;
      const payload = this.workOrderSlaService.aoConcluir(
        {
          ...this.mapearEstadoSlaCorretiva(ordem),
          status: WorkOrderStatus.COMPLETED,
          completedAt: slaEndAt,
          finalApprovalCompletedAt: slaEndAt,
        },
        config,
        slaEndAt,
      );
      if (payload) {
        Object.assign(updateData, payload);
      }
    }
    await this.prisma.workOrder.update({
      where: { id: ordem.id },
      data: updateData,
    });
    let comentario = 'OS concluída.';
    if (opcoes?.fromReview) {
      comentario = 'OS aprovada e concluída definitivamente.';
    } else if (dto?.resolutionNotes?.trim()) {
      comentario = `OS concluída. ${dto.resolutionNotes.trim()}`;
    }
    await this.registrarComentarioAutomatico(ordem.id, comentario);
    await this.concluirPlanejamentoVinculadoAoFinalizarOs(ordem.id);
    const companyId = ordem.companyId ?? this.obterCompanyId();
    const recipientIds =
      await this.workOrderQueueUsersService.resolveUserIdsFromWorkOrderId(
        ordem.id,
        companyId ?? undefined,
      );
    await this.notificarEventoCicloDeVida(
      ordem.id,
      opcoes?.fromReview ? 'approved' : 'completed',
      recipientIds,
      { skipEmail: this.omitirEmailNasNotificacoesOs },
    );
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

    const novoStatus = this.obterStatusPorNomeDaColuna(
      nomeColunaDestino,
      ordem.type,
    );
    if (novoStatus === WorkOrderStatus.IN_PROGRESS) {
      await this.validarFilasAssociadasParaIniciar(ordem.id);
    }
    const agora = new Date();
    const updateColuna: Prisma.WorkOrderUncheckedUpdateInput = {
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
        novoStatus === WorkOrderStatus.COMPLETED ||
        novoStatus === WorkOrderStatus.COMPLETED_UNDER_REVIEW
          ? agora
          : ordem.status === WorkOrderStatus.COMPLETED ||
              ordem.status === WorkOrderStatus.COMPLETED_UNDER_REVIEW
            ? null
            : undefined,
      ...this.dadosAuditoriaAtualizacaoUnchecked(this.obterUsuarioLogadoId()),
    };

    await this.prisma.workOrder.update({
      where: { id: ordem.id },
      data: updateColuna,
    });

    if (novoStatus === WorkOrderStatus.COMPLETED) {
      await this.concluirPlanejamentoVinculadoAoFinalizarOs(ordem.id);
    }

    if (novoStatus === WorkOrderStatus.COMPLETED_UNDER_REVIEW) {
      await this.registrarComentarioAutomatico(
        ordem.id,
        'OS concluída pelo técnico e enviada para análise.',
      );
    }

    if (novoStatus !== ordem.status) {
      const companyId = ordem.companyId ?? this.obterCompanyId();
      if (novoStatus === WorkOrderStatus.COMPLETED_UNDER_REVIEW) {
        const recipientIds = await this.resolverDestinatariosAdminC2c(
          companyId ?? '',
        );
        await this.notificarEventoCicloDeVida(
          ordem.id,
          'submitted_for_review',
          recipientIds,
          { skipEmail: this.omitirEmailNasNotificacoesOs },
        );
      } else {
        const recipientIds =
          await this.workOrderQueueUsersService.resolveUserIdsFromWorkOrderId(
            ordem.id,
            companyId ?? undefined,
          );
        if (novoStatus === WorkOrderStatus.IN_PROGRESS) {
          await this.notificarEventoCicloDeVida(ordem.id, 'started', recipientIds, {
            skipEmail: this.omitirEmailNasNotificacoesOs,
          });
        } else if (novoStatus === WorkOrderStatus.COMPLETED) {
          await this.notificarEventoCicloDeVida(
            ordem.id,
            'completed',
            recipientIds,
            { skipEmail: this.omitirEmailNasNotificacoesOs },
          );
        }
      }
    }

    return this.buscarDetalhesPorId(ordem.id);
  }

  private obterStatusPorNomeDaColuna(
    nomeColuna: string | null,
    type?: WorkOrderType,
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
      return this.resolverStatusConclusaoPorTipo(
        type ?? WorkOrderType.GENERAL,
      );
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

    if (dto.isDone === undefined && dto.label === undefined) {
      throw new BadRequestException(
        'Informe ao menos um campo para atualizar o item do checklist.',
      );
    }

    await this.prisma.workOrderChecklistItem.update({
      where: { id: item.id },
      data: {
        ...(dto.isDone !== undefined ? { isDone: dto.isDone } : {}),
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
      },
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
      skipEmail: this.omitirEmailNasNotificacoesOs,
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
    this.removerAuditoriaDoPayloadCliente(data);
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

    const empresaId = data.companyId ?? companyId;

    if (data.type === WorkOrderType.CORRECTIVE) {
      this.removerCamposSlaLegadoCompletoDoPayload(data);
      const config = await this.obterConfigSlaEmpresa(empresaId!);
      const slaInit = this.workOrderSlaService.inicializarSlaNaCriacao(
        new Date(),
        config,
      );
      Object.assign(data, slaInit);
      this.aplicarSlaStatusNuloParaCorretiva(data);
    } else {
      this.removerCamposSlaCalculadoLegadoDoPayload(data);
      this.normalizarPrazoMarcadorNoPayload(data);
      if (this.ehOsGeralOuPreventiva(data.type)) {
        this.validarDueDateObrigatorioGeralPreventiva(
          this.resolverDueDateEfetivoNoPayload(data),
        );
        this.aplicarSlaStatusGeralPreventiva(
          data,
          data.status ?? WorkOrderStatus.PENDING,
        );
      }
    }

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

    this.aplicarAuditoriaCriacao(data);
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
    this.removerAuditoriaDoPayloadCliente(data);
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
      } else if (data.status === WorkOrderStatus.COMPLETED_UNDER_REVIEW) {
        this.pendingLifecycleEvent = 'submitted_for_review';
        this.pendingLifecycleWorkOrderId = _id;
      }
    }

    const tipoEfetivoPatch =
      data.type !== undefined ? data.type : ordemAtual.type;

    if (
      data.status === WorkOrderStatus.COMPLETED &&
      tipoEfetivoPatch === WorkOrderType.CORRECTIVE
    ) {
      throw new BadRequestException(
        'OS corretivas não podem ser concluídas diretamente. Use a aprovação de conclusão.',
      );
    }

    if (
      ordemAtual.status === WorkOrderStatus.COMPLETED_UNDER_REVIEW &&
      data.status !== undefined &&
      data.status !== WorkOrderStatus.COMPLETED_UNDER_REVIEW
    ) {
      throw new BadRequestException(
        'OS em análise só pode ser aprovada ou reprovada pelos endpoints dedicados.',
      );
    }

    if (data.status === WorkOrderStatus.COMPLETED) {
      const completedAt = new Date();
      (data as any).completedAt = completedAt;
      const tipoAoConcluir =
        data.type !== undefined ? data.type : ordemAtual.type;
      if (tipoAoConcluir === WorkOrderType.CORRECTIVE) {
        const config = await this.resolverConfigSlaDaOrdem(ordemAtual);
        const payload = this.workOrderSlaService.aoConcluir(
          {
            ...this.mapearEstadoSlaCorretiva(ordemAtual),
            status: WorkOrderStatus.COMPLETED,
            completedAt,
          },
          config,
          completedAt,
        );
        if (payload) {
          Object.assign(data as object, payload);
        }
      } else {
        this.removerCamposSlaCalculadoLegadoDoPayload(data);
        this.normalizarPrazoMarcadorNoPayload(data);
        if (this.ehOsGeralOuPreventiva(tipoAoConcluir)) {
          const dueDateEfetivo = this.resolverDueDateEfetivoNoPayload(
            data,
            ordemAtual,
          );
          this.aplicarSlaStatusGeralPreventiva(
            data,
            WorkOrderStatus.COMPLETED,
            dueDateEfetivo,
            (data as { completedAt?: Date }).completedAt ?? completedAt,
          );
        }
      }
      this.aplicarAuditoriaAtualizacao(data);
      return;
    }

    if (data.status === WorkOrderStatus.COMPLETED_UNDER_REVIEW) {
      if (tipoEfetivoPatch !== WorkOrderType.CORRECTIVE) {
        throw new BadRequestException(
          'O status em análise é exclusivo para OS corretivas.',
        );
      }
      const completedAt = new Date();
      (data as { completedAt?: Date }).completedAt = completedAt;
      (data as { finalApprovalCompletedAt?: null }).finalApprovalCompletedAt =
        null;
      this.aplicarAuditoriaAtualizacao(data);
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
      (ordemAtual.status === WorkOrderStatus.COMPLETED ||
        ordemAtual.status === WorkOrderStatus.COMPLETED_UNDER_REVIEW)
    ) {
      (data as any).completedAt = null;
      (data as any).finalApprovalCompletedAt = null;
    }

    const tipoEfetivoAtualizacao =
      data.type !== undefined ? data.type : ordemAtual.type;

    if (tipoEfetivoAtualizacao === WorkOrderType.CORRECTIVE) {
      this.removerCamposSlaLegadoCompletoDoPayload(data);
    } else {
      this.removerCamposSlaCalculadoLegadoDoPayload(data);
      this.normalizarPrazoMarcadorNoPayload(data);
      if (this.ehOsGeralOuPreventiva(tipoEfetivoAtualizacao)) {
        const dueDateEfetivo = this.resolverDueDateEfetivoNoPayload(
          data,
          ordemAtual,
        );
        this.validarDueDateObrigatorioGeralPreventiva(dueDateEfetivo);
        const statusEfetivo =
          data.status !== undefined ? data.status : ordemAtual.status;
        this.aplicarSlaStatusGeralPreventiva(
          data,
          statusEfetivo,
          dueDateEfetivo,
          ordemAtual.completedAt,
        );
      }
    }

    this.aplicarAuditoriaAtualizacao(data);
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
        { skipEmail: this.omitirEmailNasNotificacoesOs },
      );
      this.pendingPreviousQueueIds = null;
      this.pendingUpdateQueueIds = null;
    }

    if (this.pendingLifecycleEvent && this.pendingLifecycleWorkOrderId) {
      const companyId = this.obterCompanyId();
      const recipientIds =
        this.pendingLifecycleEvent === 'submitted_for_review'
          ? await this.resolverDestinatariosAdminC2c(companyId ?? '')
          : await this.workOrderQueueUsersService.resolveUserIdsFromWorkOrderId(
              this.pendingLifecycleWorkOrderId,
              companyId ?? undefined,
            );
      await this.notificarEventoCicloDeVida(
        this.pendingLifecycleWorkOrderId,
        this.pendingLifecycleEvent,
        recipientIds,
        { skipEmail: this.omitirEmailNasNotificacoesOs },
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
        await this.notificarMudancasFilasNaOs(data.id, [], queueIds, {
          skipEmail: this.omitirEmailNasNotificacoesOs,
        });
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
        workOrderQueues: construirWorkOrderQueuesOnWorkOrderInclude(companyId ?? undefined),
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
    opcoes?: { skipEmail?: boolean },
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
            skipEmail: opcoes?.skipEmail,
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
            skipEmail: opcoes?.skipEmail,
          },
        );
      }
    }
  }

  private async notificarEventoCicloDeVida(
    workOrderId: string,
    kind: WorkOrderLifecycleEventKind,
    recipientUserIds: string[],
    opcoes?: { skipEmail?: boolean; rejectionReason?: string },
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
      skipEmail: opcoes?.skipEmail,
      rejectionReason: opcoes?.rejectionReason,
    });
  }

  protected async antesDeDesativar(id: string): Promise<void> {
    const ordem = await this.buscarOrdemPorId(id);

    if (
      ordem.status === WorkOrderStatus.IN_PROGRESS ||
      ordem.status === WorkOrderStatus.PAUSED
    ) {
      throw new BadRequestException(
        'Não é possível excluir uma ordem de serviço com trabalho em andamento ou pausado.',
      );
    }
  }

  protected async depoisDeDesativar(id: string): Promise<void> {
    const ordem = await this.prisma.workOrder.findFirst({
      where: { id },
      select: { companyId: true },
    });

    const companyId = this.obterCompanyId() ?? ordem?.companyId;
    const recipientIds =
      await this.workOrderQueueUsersService.resolveUserIdsFromWorkOrderId(
        id,
        companyId ?? undefined,
      );
    await this.notificarEventoCicloDeVida(id, 'deleted', recipientIds, {
      skipEmail: this.omitirEmailNasNotificacoesOs,
    });
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
    let mapped: Record<string, unknown> = {
      ...rest,
      queues,
      assignees,
    };

    if (
      mapped.type === WorkOrderType.CORRECTIVE &&
      this.cachedCompanySlaConfig
    ) {
      mapped = this.enriquecerRegistroComSlaCorretiva(
        mapped,
        this.cachedCompanySlaConfig,
      );
    }

    if (this.ehOsGeralOuPreventiva(mapped.type as WorkOrderType)) {
      mapped = this.enriquecerRegistroComSlaGeralPreventiva(mapped);
    }

    return mapped;
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
      ...this.dadosAuditoriaAtualizacaoPrisma(autorId),
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

  private async obterConfigSlaEmpresa(
    companyId: string,
  ): Promise<CorrectiveSlaCompanyConfig> {
    if (
      this.cachedCompanySlaConfig &&
      this.obterCompanyId() === companyId
    ) {
      return this.cachedCompanySlaConfig;
    }
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        correctiveSlaDefaultSeconds: true,
        correctiveSlaWindowStart: true,
        correctiveSlaWindowEnd: true,
      },
    });
    const config = normalizarConfigSlaEmpresa(company ?? undefined);
    this.cachedCompanySlaConfig = config;
    return config;
  }

  private mapearEstadoSlaCorretiva(ordem: {
    type: WorkOrderType;
    status: WorkOrderStatus;
    slaStartAt?: Date | null;
    slaPausedAt?: Date | null;
    slaResumedAt?: Date | null;
    slaConsumedSeconds?: number | null;
    slaDeadlineAt?: Date | null;
    slaStatusExtended?: WorkOrderCorrectiveSlaStatus | null;
    slaExceededAt?: Date | null;
    completedAt?: Date | null;
    finalApprovalCompletedAt?: Date | null;
  }) {
    return {
      type: ordem.type,
      status: ordem.status,
      slaStartAt: ordem.slaStartAt ?? null,
      slaPausedAt: ordem.slaPausedAt ?? null,
      slaResumedAt: ordem.slaResumedAt ?? null,
      slaConsumedSeconds: ordem.slaConsumedSeconds ?? 0,
      slaDeadlineAt: ordem.slaDeadlineAt ?? null,
      slaStatusExtended: ordem.slaStatusExtended ?? null,
      slaExceededAt: ordem.slaExceededAt ?? null,
      completedAt: ordem.completedAt ?? null,
      finalApprovalCompletedAt: ordem.finalApprovalCompletedAt ?? null,
    };
  }

  private aplicarJanelaSlaEmpacotadaSeAusente(
    data: Prisma.WorkOrderUpdateInput,
    ordem: CorrectiveSlaOrderSnapshot,
    config: CorrectiveSlaCompanyConfig,
  ): void {
    if (desempacotarJanelaSla(ordem.slaDeadlineHours)) {
      return;
    }
    (data as { slaDeadlineHours?: number }).slaDeadlineHours = empacotarJanelaSla(
      config.correctiveSlaWindowStart,
      config.correctiveSlaWindowEnd,
    );
  }

  private extrairSnapshotSlaDaOrdem(
    ordem: CorrectiveSlaOrderSnapshot | Record<string, unknown>,
  ): CorrectiveSlaOrderSnapshot {
    const record = ordem as Record<string, unknown>;
    return {
      slaDeadlineHours: (record.slaDeadlineHours as number | null) ?? null,
      slaStartAt: (record.slaStartAt as Date | null) ?? null,
      slaDeadlineAt: (record.slaDeadlineAt as Date | null) ?? null,
      slaConsumedSeconds: (record.slaConsumedSeconds as number | null) ?? null,
      slaRemainingSeconds:
        (record.slaRemainingSeconds as number | null) ?? null,
      slaExceededAt: (record.slaExceededAt as Date | null) ?? null,
      slaStatusExtended:
        (record.slaStatusExtended as string | null) ?? null,
    };
  }

  private montarCamposVirtuaisSlaCorretiva(
    record: Record<string, unknown>,
    companyConfig: CorrectiveSlaCompanyConfig,
  ): Pick<
    Record<string, unknown>,
    | 'correctiveSlaTotalSeconds'
    | 'correctiveSlaWindowStart'
    | 'correctiveSlaWindowEnd'
  > {
    const config = resolverConfigSlaDaOrdem(
      this.extrairSnapshotSlaDaOrdem(record),
      companyConfig,
    );
    return {
      correctiveSlaTotalSeconds: config.correctiveSlaDefaultSeconds,
      correctiveSlaWindowStart: config.correctiveSlaWindowStart,
      correctiveSlaWindowEnd: config.correctiveSlaWindowEnd,
    };
  }

  private montarCamposVirtuaisSlaNegativa(
    record: Record<string, unknown>,
    companyConfig: CorrectiveSlaCompanyConfig,
    agora: Date = new Date(),
  ): Pick<
    Record<string, unknown>,
    | 'correctiveSlaOverdueActive'
    | 'correctiveSlaOverdueSeconds'
    | 'correctiveSlaOverdueStatus'
  > {
    const config = resolverConfigSlaDaOrdem(
      this.extrairSnapshotSlaDaOrdem(record),
      companyConfig,
    );
    const budget = config.correctiveSlaDefaultSeconds;
    const negativo = calcularSlaNegativoCorretiva(
      {
        status: record.status as WorkOrderStatus,
        slaStartAt: (record.slaStartAt as Date | null) ?? null,
        slaDeadlineAt: (record.slaDeadlineAt as Date | null) ?? null,
        slaPausedAt: (record.slaPausedAt as Date | null) ?? null,
        slaResumedAt: (record.slaResumedAt as Date | null) ?? null,
        slaConsumedSeconds: (record.slaConsumedSeconds as number | null) ?? 0,
        slaStatusExtended:
          (record.slaStatusExtended as WorkOrderCorrectiveSlaStatus | null) ??
          null,
        completedAt: (record.completedAt as Date | null) ?? null,
        finalApprovalCompletedAt:
          (record.finalApprovalCompletedAt as Date | null) ?? null,
      },
      config,
      budget,
      agora,
    );
    return {
      correctiveSlaOverdueActive: negativo.isOverdue,
      correctiveSlaOverdueSeconds: negativo.overdueSeconds,
      correctiveSlaOverdueStatus: negativo.overdueStatus,
    };
  }

  private async resolverConfigSlaDaOrdem(
    ordem: CorrectiveSlaOrderSnapshot & { companyId: string },
  ): Promise<CorrectiveSlaCompanyConfig> {
    const companyConfig = await this.obterConfigSlaEmpresa(ordem.companyId);
    return resolverConfigSlaDaOrdem(
      this.extrairSnapshotSlaDaOrdem(ordem),
      companyConfig,
    );
  }

  private ehOsGeralOuPreventiva(type?: WorkOrderType | null): boolean {
    return type === WorkOrderType.GENERAL || type === WorkOrderType.PREVENTIVE;
  }

  private validarDueDateObrigatorioGeralPreventiva(
    dueDate: Date | null | undefined,
  ): void {
    if (!dueDate) {
      throw new BadRequestException(
        'Prazo é obrigatório para OS Geral e Preventiva.',
      );
    }
  }

  private resolverDueDateEfetivoNoPayload(
    data: CreateWorkOrderDto | UpdateWorkOrderDto,
    ordemAtual?: { dueDate?: Date | null },
  ): Date | null {
    if (Object.prototype.hasOwnProperty.call(data, 'dueDate')) {
      const raw = (data as { dueDate?: unknown }).dueDate;
      if (raw === null || raw === undefined) {
        return null;
      }
      if (raw instanceof Date) {
        return raw;
      }
      if (typeof raw === 'string') {
        const dia = extrairDiaCivilDoPrazo(raw);
        return dia ? diaCivilParaDatePostgres(dia) : null;
      }
      return null;
    }
    return ordemAtual?.dueDate ?? null;
  }

  private aplicarSlaStatusGeralPreventiva(
    data:
      | CreateWorkOrderDto
      | UpdateWorkOrderDto
      | Prisma.WorkOrderUpdateInput
      | Prisma.WorkOrderUncheckedUpdateInput,
    status: WorkOrderStatus,
    dueDateExplicito?: Date | null,
    completedAtExplicito?: Date | null,
  ): void {
    const dueDate =
      dueDateExplicito !== undefined
        ? dueDateExplicito
        : this.resolverDueDateEfetivoNoPayload(
            data as CreateWorkOrderDto | UpdateWorkOrderDto,
          );
    if (!dueDate) {
      return;
    }
    (data as { slaStatus?: WorkOrderSlaStatus }).slaStatus =
      this.generalPreventiveSlaService.calcularSlaStatus(
        dueDate,
        status,
        new Date(),
        completedAtExplicito,
      );
  }

  private enriquecerRegistroComSlaGeralPreventiva(
    record: Record<string, unknown>,
  ): Record<string, unknown> {
    const dueDate = (record.dueDate as Date | null) ?? null;
    if (!dueDate) {
      return record;
    }
    const status = record.status as WorkOrderStatus;
    const completedAt = (record.completedAt as Date | null) ?? null;
    return {
      ...record,
      slaStatus: this.generalPreventiveSlaService.calcularSlaStatus(
        dueDate,
        status,
        new Date(),
        completedAt,
      ),
    };
  }

  private enriquecerRegistroComSlaCorretiva(
    record: Record<string, unknown>,
    companyConfig: CorrectiveSlaCompanyConfig,
  ): Record<string, unknown> {
    if (record.type !== WorkOrderType.CORRECTIVE) {
      return record;
    }

    const agora = new Date();
    const virtuais = this.montarCamposVirtuaisSlaCorretiva(record, companyConfig);
    const virtuaisNegativos = this.montarCamposVirtuaisSlaNegativa(
      record,
      companyConfig,
      agora,
    );
    const status = record.status as WorkOrderStatus;
    const slaStartAt = (record.slaStartAt as Date | null) ?? null;

    if (
      status === WorkOrderStatus.COMPLETED ||
      status === WorkOrderStatus.PAUSED ||
      status === WorkOrderStatus.CANCELLED ||
      !slaStartAt
    ) {
      return {
        ...record,
        slaStatus: null,
        ...virtuais,
        ...virtuaisNegativos,
      };
    }

    const config = resolverConfigSlaDaOrdem(
      this.extrairSnapshotSlaDaOrdem(record),
      companyConfig,
    );
    const snapshot = this.workOrderSlaService.calcularSnapshot(
      {
        type: WorkOrderType.CORRECTIVE,
        status,
        slaStartAt,
        slaPausedAt: (record.slaPausedAt as Date | null) ?? null,
        slaResumedAt: (record.slaResumedAt as Date | null) ?? null,
        slaConsumedSeconds: (record.slaConsumedSeconds as number | null) ?? 0,
        slaDeadlineAt: (record.slaDeadlineAt as Date | null) ?? null,
        slaStatusExtended:
          (record.slaStatusExtended as WorkOrderCorrectiveSlaStatus | null) ??
          null,
        slaExceededAt: (record.slaExceededAt as Date | null) ?? null,
        completedAt: (record.completedAt as Date | null) ?? null,
        finalApprovalCompletedAt:
          (record.finalApprovalCompletedAt as Date | null) ?? null,
      },
      config,
      agora,
      { preservarDeadlinePersistido: true },
    );
    if (!snapshot) {
      return {
        ...record,
        slaStatus: null,
        ...virtuais,
        ...virtuaisNegativos,
      };
    }
    const recordComSnapshot = {
      ...record,
      slaStartAt: snapshot.slaStartAt,
      slaPausedAt: snapshot.slaPausedAt,
      slaResumedAt: snapshot.slaResumedAt,
      slaConsumedSeconds: snapshot.slaConsumedSeconds,
      slaRemainingSeconds: snapshot.slaRemainingSeconds,
      slaDeadlineAt: (record.slaDeadlineAt as Date | null) ?? snapshot.slaDeadlineAt,
      slaStatusExtended: snapshot.slaStatusExtended,
      slaExceededAt: snapshot.slaExceededAt,
      correctiveSlaTotalSeconds: snapshot.totalBudgetSeconds,
      correctiveSlaWindowStart: config.correctiveSlaWindowStart,
      correctiveSlaWindowEnd: config.correctiveSlaWindowEnd,
    };
    const virtuaisNegativosAtualizados = this.montarCamposVirtuaisSlaNegativa(
      recordComSnapshot,
      companyConfig,
      agora,
    );
    return {
      ...recordComSnapshot,
      slaStatus: null,
      ...virtuaisNegativosAtualizados,
    };
  }

  async notificarLimaresSlaCorretiva(
    workOrderId: string,
    companyId: string,
    title: string,
    snapshot: NonNullable<
      ReturnType<WorkOrderSlaService['calcularSnapshot']>
    >,
    flags: {
      slaNearBreachNotifiedAt: Date | null;
      slaOneHourLeftNotifiedAt: Date | null;
      slaBreachedNotifiedAt: Date | null;
    },
  ): Promise<void> {
    await this.workOrderCorrectiveSlaNotificationService.processarAposSnapshot(
      {
        workOrderId,
        companyId,
        workOrderTitle: title,
        actorUserId: this.obterUsuarioLogadoId() ?? 'system',
        snapshot,
        ...flags,
      },
    );
  }

  private dadosAuditoriaAtualizacaoPrisma(
    userId?: string | null,
  ): Prisma.WorkOrderUpdateInput {
    if (!userId) {
      return {};
    }
    return {
      updatedByUser: { connect: { id: userId } },
    };
  }

  /** Atualizações com FKs escalares (ex.: `columnId`) usam input unchecked. */
  private dadosAuditoriaAtualizacaoUnchecked(
    userId?: string | null,
  ): Pick<Prisma.WorkOrderUncheckedUpdateInput, 'updatedBy'> {
    if (!userId) {
      return {};
    }
    return { updatedBy: userId };
  }

  private removerAuditoriaDoPayloadCliente(
    data: CreateWorkOrderDto | UpdateWorkOrderDto,
  ): void {
    delete (data as { createdBy?: unknown }).createdBy;
    delete (data as { updatedBy?: unknown }).updatedBy;
    delete (data as { createdByUser?: unknown }).createdByUser;
    delete (data as { updatedByUser?: unknown }).updatedByUser;
  }

  private aplicarAuditoriaCriacao(data: CreateWorkOrderDto): void {
    const userId = this.obterUsuarioLogadoId();
    if (!userId) {
      return;
    }
    const audit = this.dadosAuditoriaCriacaoPrisma(userId);
    Object.assign(data as object, audit);
  }

  private aplicarAuditoriaAtualizacao(data: UpdateWorkOrderDto): void {
    const userId = this.obterUsuarioLogadoId();
    if (!userId) {
      return;
    }
    const audit = this.dadosAuditoriaAtualizacaoPrisma(userId);
    Object.assign(data as object, audit);
  }

  /** Create/update via repositório universal (input checked do Prisma). */
  private dadosAuditoriaCriacaoPrisma(
    userId: string,
  ): Pick<Prisma.WorkOrderCreateInput, 'createdByUser' | 'updatedByUser'> {
    const connect = { connect: { id: userId } };
    return {
      createdByUser: connect,
      updatedByUser: connect,
    };
  }

  /** Corretiva: ignora prazo marcador e SLA legado por data (usa tempo útil). */
  private removerCamposSlaLegadoCompletoDoPayload(
    data: CreateWorkOrderDto | UpdateWorkOrderDto,
  ): void {
    delete (data as { dueDate?: unknown }).dueDate;
    this.removerCamposSlaCalculadoLegadoDoPayload(data);
    this.aplicarSlaStatusNuloParaCorretiva(data);
  }

  /** `slaStatus` legado não se aplica à corretiva; evita o default OK do Prisma. */
  private aplicarSlaStatusNuloParaCorretiva(
    data:
      | CreateWorkOrderDto
      | UpdateWorkOrderDto
      | Prisma.WorkOrderUpdateInput
      | Prisma.WorkOrderUncheckedUpdateInput,
  ): void {
    (data as { slaStatus?: WorkOrderSlaStatus | null }).slaStatus = null;
  }

  /** Preventiva/Geral: ignora apenas SLA calculado por data; mantém `dueDate` como marcador. */
  private removerCamposSlaCalculadoLegadoDoPayload(
    data: CreateWorkOrderDto | UpdateWorkOrderDto,
  ): void {
    delete (data as { slaDeadlineHours?: unknown }).slaDeadlineHours;
    delete (data as { slaStatus?: unknown }).slaStatus;
  }

  private normalizarPrazoMarcadorNoPayload(
    data: CreateWorkOrderDto | UpdateWorkOrderDto,
  ): void {
    if (!Object.prototype.hasOwnProperty.call(data, 'dueDate')) {
      return;
    }
    const raw = (data as { dueDate?: string | null }).dueDate;
    if (raw === null || raw === undefined) {
      return;
    }
    const dia = extrairDiaCivilDoPrazo(raw);
    if (!dia) {
      delete (data as { dueDate?: unknown }).dueDate;
      return;
    }
    (data as Record<string, unknown>).dueDate = diaCivilParaDatePostgres(dia);
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
