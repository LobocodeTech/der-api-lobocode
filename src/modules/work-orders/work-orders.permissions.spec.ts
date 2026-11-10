import { BadRequestException } from '@nestjs/common';
import { Roles, WorkOrderStatus, WorkOrderType } from '@prisma/client';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersController } from './work-orders.controller';
import { ROLE_BY_METHOD_KEY } from 'src/shared/auth/role-by-method.decorator';

/**
 * Regras de permissão do ciclo de vida da OS:
 * - Iniciar: FIELD_TEAM (membro da fila), ADMIN e SYSTEM_ADMIN (sem precisar estar na fila).
 * - Concluir corretiva: FIELD_TEAM, ADMIN e SYSTEM_ADMIN (vai para análise).
 * - Concluir preventiva/geral: qualquer perfil.
 * - Aprovar/reprovar conclusão: ADMIN, C2C e SYSTEM_ADMIN.
 */

const USER_ID = 'user-1';

type Ordem = {
  id: string;
  companyId: string;
  status: WorkOrderStatus;
  type: WorkOrderType;
  startedAt: Date | null;
  startedBy: string | null;
};

function construirServico(
  role: Roles,
  ordemParcial: Partial<Ordem> = {},
  membrosDaFila: string[] = [USER_ID],
) {
  const ordem: Ordem = {
    id: 'os-1',
    companyId: 'empresa-1',
    status: WorkOrderStatus.ASSIGNED,
    type: WorkOrderType.PREVENTIVE,
    startedAt: null,
    startedBy: null,
    ...ordemParcial,
  };

  const update = jest.fn<any>().mockResolvedValue({});
  const notificar = jest.fn<any>().mockResolvedValue(undefined);
  const concluirDefinitiva = jest.fn<any>().mockResolvedValue(undefined);

  const service = Object.assign(
    Object.create(WorkOrdersService.prototype) as object,
    {
      omitirEmailNasNotificacoesOs: true,
      obterUsuarioLogado: () => ({ id: USER_ID, role }),
      obterUsuarioLogadoId: () => USER_ID,
      obterCompanyId: () => 'empresa-1',
      buscarOrdemPorId: jest.fn<any>().mockResolvedValue(ordem),
      buscarDetalhesPorId: jest.fn<any>().mockResolvedValue({ id: ordem.id }),
      validarFilasAssociadasParaIniciar: jest
        .fn<any>()
        .mockResolvedValue(undefined),
      workOrderQueueUsersService: {
        resolveUserIdsFromWorkOrderId: jest
          .fn<any>()
          .mockResolvedValue(membrosDaFila),
      },
      dadosAuditoriaAtualizacaoPrisma: () => ({}),
      dadosAtorCompletedByPrisma: () => ({}),
      registrarComentarioAutomatico: jest
        .fn<any>()
        .mockResolvedValue(undefined),
      notificarEventoCicloDeVida: notificar,
      resolverColunaPorStatusDaOrdem: jest.fn<any>().mockResolvedValue(null),
      resolverDestinatariosAdminC2c: jest.fn<any>().mockResolvedValue([]),
      executarConclusaoDefinitiva: concluirDefinitiva,
      prisma: { workOrder: { update } },
    },
  ) as unknown as WorkOrdersService;

  return { service, update, notificar, concluirDefinitiva };
}

const dadosDoUpdate = (update: jest.Mock<any>) =>
  (update.mock.calls[0][0] as { data: Record<string, unknown> }).data;

describe('Permissões — iniciar OS', () => {
  it.each([Roles.FIELD_TEAM, Roles.ADMIN, Roles.SYSTEM_ADMIN])(
    '%s pode iniciar',
    async (role) => {
      const { service, update } = construirServico(role);

      await service.iniciarTrabalho('os-1');

      expect(dadosDoUpdate(update).status).toBe(WorkOrderStatus.IN_PROGRESS);
    },
  );

  it.each([Roles.C2C])('%s não pode iniciar', async (role) => {
    const { service, update } = construirServico(role);

    await expect(service.iniciarTrabalho('os-1')).rejects.toThrow(
      'Apenas usuários Técnicos do Campo',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('FIELD_TEAM fora da fila não pode iniciar', async () => {
    const { service, update } = construirServico(Roles.FIELD_TEAM, {}, [
      'outro-usuario',
    ]);

    await expect(service.iniciarTrabalho('os-1')).rejects.toThrow(
      'fila da qual participa',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('ADMIN fora da fila pode iniciar', async () => {
    const { service, update } = construirServico(Roles.ADMIN, {}, [
      'outro-usuario',
    ]);

    await service.iniciarTrabalho('os-1');

    expect(dadosDoUpdate(update).status).toBe(WorkOrderStatus.IN_PROGRESS);
  });

  it('ADMIN não inicia OS sem fila com membros', async () => {
    const { service } = construirServico(Roles.ADMIN, {}, []);

    await expect(service.iniciarTrabalho('os-1')).rejects.toThrow(
      'ao menos uma fila com membros',
    );
  });

  it('ADMIN não inicia OS cancelada', async () => {
    const { service } = construirServico(Roles.ADMIN, {
      status: WorkOrderStatus.CANCELLED,
    });

    await expect(service.iniciarTrabalho('os-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('Permissões — concluir OS', () => {
  const corretivaEmAndamento = {
    type: WorkOrderType.CORRECTIVE,
    status: WorkOrderStatus.IN_PROGRESS,
  };

  it.each([Roles.FIELD_TEAM, Roles.ADMIN, Roles.SYSTEM_ADMIN])(
    '%s conclui corretiva e ela vai para análise',
    async (role) => {
      const { service, update, notificar } = construirServico(
        role,
        corretivaEmAndamento,
      );

      await service.concluirOrdem('os-1', {} as any);

      expect(dadosDoUpdate(update).status).toBe(
        WorkOrderStatus.COMPLETED_UNDER_REVIEW,
      );
      expect(notificar).toHaveBeenCalledWith(
        'os-1',
        'submitted_for_review',
        expect.anything(),
        expect.anything(),
      );
    },
  );

  it.each([Roles.C2C])('%s não conclui corretiva', async (role) => {
    const { service, update } = construirServico(role, corretivaEmAndamento);

    await expect(service.concluirOrdem('os-1', {} as any)).rejects.toThrow(
      'Apenas técnicos de campo',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('ADMIN não conclui corretiva pausada', async () => {
    const { service } = construirServico(Roles.ADMIN, {
      type: WorkOrderType.CORRECTIVE,
      status: WorkOrderStatus.PAUSED,
    });

    await expect(service.concluirOrdem('os-1', {} as any)).rejects.toThrow(
      'em andamento',
    );
  });

  it.each([Roles.FIELD_TEAM, Roles.ADMIN, Roles.C2C, Roles.SYSTEM_ADMIN])(
    '%s conclui preventiva diretamente',
    async (role) => {
      const { service, concluirDefinitiva } = construirServico(role, {
        type: WorkOrderType.PREVENTIVE,
        status: WorkOrderStatus.IN_PROGRESS,
      });

      await service.concluirOrdem('os-1', {} as any);

      expect(concluirDefinitiva).toHaveBeenCalled();
    },
  );
});

describe('Permissões — mover no kanban', () => {
  function servicoKanban(
    role: Roles,
    statusAtual: WorkOrderStatus,
    nomeColuna: string,
    tipo: WorkOrderType = WorkOrderType.CORRECTIVE,
    membrosDaFila: string[] = [USER_ID],
  ) {
    const base = construirServico(role, {}, membrosDaFila);
    const ordem = {
      id: 'os-1',
      companyId: 'empresa-1',
      status: statusAtual,
      type: tipo,
      startedAt: null,
      location: { regionalId: null },
      column: null,
    };
    Object.assign(base.service as object, {
      dadosAuditoriaAtualizacaoUnchecked: () => ({}),
      concluirPlanejamentoVinculadoAoFinalizarOs: jest
        .fn<any>()
        .mockResolvedValue(undefined),
      prisma: {
        workOrder: {
          findFirst: jest.fn<any>().mockResolvedValue(ordem),
          update: base.update,
        },
        workOrderColumn: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: 'col-1',
            regionalId: null,
            name: nomeColuna,
          }),
        },
      },
    });
    return base;
  }

  const mover = (service: WorkOrdersService) =>
    service.moverParaColuna('os-1', { columnId: 'col-1' } as any);

  it.each([Roles.FIELD_TEAM, Roles.ADMIN, Roles.SYSTEM_ADMIN])(
    '%s inicia arrastando para "Em andamento"',
    async (role) => {
      const { service, update } = servicoKanban(
        role,
        WorkOrderStatus.ASSIGNED,
        'Em andamento',
      );
      await mover(service);
      expect(dadosDoUpdate(update).status).toBe(WorkOrderStatus.IN_PROGRESS);
    },
  );

  it.each([Roles.C2C])(
    '%s não inicia arrastando para "Em andamento"',
    async (role) => {
      const { service, update } = servicoKanban(
        role,
        WorkOrderStatus.PENDING,
        'Em andamento',
      );
      await expect(mover(service)).rejects.toThrow(
        'Apenas usuários Técnicos do Campo',
      );
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('C2C não inicia arrastando para coluna "Monitoramento"', async () => {
    const { service, update } = servicoKanban(
      Roles.C2C,
      WorkOrderStatus.ASSIGNED,
      'Monitoramento',
    );
    await expect(mover(service)).rejects.toThrow(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('FIELD_TEAM fora da fila não inicia pelo kanban', async () => {
    const { service, update } = servicoKanban(
      Roles.FIELD_TEAM,
      WorkOrderStatus.ASSIGNED,
      'Em andamento',
      WorkOrderType.CORRECTIVE,
      ['outro-usuario'],
    );
    await expect(mover(service)).rejects.toThrow('fila da qual participa');
    expect(update).not.toHaveBeenCalled();
  });

  it('C2C move OS já em andamento (retomada) sem bloqueio', async () => {
    const { service, update } = servicoKanban(
      Roles.C2C,
      WorkOrderStatus.IN_PROGRESS,
      'Em andamento',
    );
    await mover(service);
    expect(update).toHaveBeenCalled();
  });

  it.each([Roles.FIELD_TEAM, Roles.ADMIN, Roles.SYSTEM_ADMIN])(
    '%s conclui corretiva arrastando (vai para análise)',
    async (role) => {
      const { service, update } = servicoKanban(
        role,
        WorkOrderStatus.IN_PROGRESS,
        'Concluída',
      );
      await mover(service);
      expect(dadosDoUpdate(update).status).toBe(
        WorkOrderStatus.COMPLETED_UNDER_REVIEW,
      );
    },
  );

  it.each([Roles.C2C])('%s não conclui corretiva arrastando', async (role) => {
    const { service, update } = servicoKanban(
      role,
      WorkOrderStatus.IN_PROGRESS,
      'Concluída',
    );
    await expect(mover(service)).rejects.toThrow('Apenas técnicos de campo');
    expect(update).not.toHaveBeenCalled();
  });

  it('C2C conclui preventiva arrastando', async () => {
    const { service, update } = servicoKanban(
      Roles.C2C,
      WorkOrderStatus.IN_PROGRESS,
      'Concluída',
      WorkOrderType.PREVENTIVE,
    );
    await mover(service);
    expect(dadosDoUpdate(update).status).toBe(WorkOrderStatus.COMPLETED);
  });

  it.each([Roles.FIELD_TEAM, Roles.ADMIN, Roles.C2C, Roles.SYSTEM_ADMIN])(
    '%s não tira OS da análise pelo kanban',
    async (role) => {
      const { service, update } = servicoKanban(
        role,
        WorkOrderStatus.COMPLETED_UNDER_REVIEW,
        'Em andamento',
      );
      await expect(mover(service)).rejects.toThrow(
        'só pode ser aprovada ou reprovada',
      );
      expect(update).not.toHaveBeenCalled();
    },
  );
});

describe('Permissões — edição comum (status no PATCH)', () => {
  function servicoEdicao(role: Roles, statusAtual: WorkOrderStatus) {
    const base = construirServico(role);
    Object.assign(base.service as object, {
      removerAuditoriaDoPayloadCliente: () => undefined,
      repository: {
        buscarPrimeiro: jest.fn<any>().mockResolvedValue({
          id: 'os-1',
          companyId: 'empresa-1',
          status: statusAtual,
          type: WorkOrderType.CORRECTIVE,
          locationId: 'loc-1',
          equipmentType: null,
          startedAt: null,
        }),
      },
    });
    const antesDeAtualizar = (status: WorkOrderStatus) =>
      (
        base.service as unknown as {
          antesDeAtualizar(id: string, data: unknown): Promise<void>;
        }
      ).antesDeAtualizar('os-1', { status });
    return { ...base, antesDeAtualizar };
  }

  it.each([Roles.C2C])(
    '%s não inicia mudando status para IN_PROGRESS',
    async (role) => {
      const { antesDeAtualizar } = servicoEdicao(
        role,
        WorkOrderStatus.ASSIGNED,
      );
      await expect(
        antesDeAtualizar(WorkOrderStatus.IN_PROGRESS),
      ).rejects.toThrow('Apenas usuários Técnicos do Campo');
    },
  );

  it.each([Roles.C2C])(
    '%s não conclui corretiva mudando status para análise',
    async (role) => {
      const { antesDeAtualizar } = servicoEdicao(
        role,
        WorkOrderStatus.IN_PROGRESS,
      );
      await expect(
        antesDeAtualizar(WorkOrderStatus.COMPLETED_UNDER_REVIEW),
      ).rejects.toThrow('Apenas técnicos de campo');
    },
  );

  it('ADMIN passa pela validação ao iniciar via edição', async () => {
    const { service, antesDeAtualizar } = servicoEdicao(
      Roles.ADMIN,
      WorkOrderStatus.ASSIGNED,
    );
    const validar = jest.spyOn(
      service as unknown as {
        validarTransicaoDeStatus: (...a: unknown[]) => Promise<void>;
      },
      'validarTransicaoDeStatus',
    );
    // O restante do hook depende de muitos colaboradores; basta garantir
    // que a validação de transição não bloqueia o ADMIN.
    await antesDeAtualizar(WorkOrderStatus.IN_PROGRESS).catch(() => undefined);
    expect(validar).toHaveBeenCalled();
    await expect(validar.mock.results[0].value).resolves.toBeUndefined();
  });
});

describe('Permissões — aprovar/reprovar conclusão', () => {
  const corretivaEmAnalise = {
    type: WorkOrderType.CORRECTIVE,
    status: WorkOrderStatus.COMPLETED_UNDER_REVIEW,
  };

  it.each([Roles.ADMIN, Roles.C2C, Roles.SYSTEM_ADMIN])(
    '%s pode aprovar',
    async (role) => {
      const { service, concluirDefinitiva } = construirServico(
        role,
        corretivaEmAnalise,
      );

      await service.aprovarConclusaoOrdem('os-1');

      expect(concluirDefinitiva).toHaveBeenCalled();
    },
  );

  it.each([Roles.ADMIN, Roles.C2C, Roles.SYSTEM_ADMIN])(
    '%s pode reprovar',
    async (role) => {
      const { service, update } = construirServico(role, corretivaEmAnalise);

      await service.reprovarConclusaoOrdem('os-1', {
        reason: 'Refazer',
      } as any);

      expect(dadosDoUpdate(update).status).toBe(WorkOrderStatus.IN_PROGRESS);
    },
  );

  it.each([Roles.FIELD_TEAM])(
    '%s não pode aprovar nem reprovar',
    async (role) => {
      const { service, update, concluirDefinitiva } = construirServico(
        role,
        corretivaEmAnalise,
      );

      await expect(service.aprovarConclusaoOrdem('os-1')).rejects.toThrow(
        'não tem permissão para aprovar ou reprovar',
      );
      await expect(
        service.reprovarConclusaoOrdem('os-1', { reason: 'x' } as any),
      ).rejects.toThrow('não tem permissão para aprovar ou reprovar');
      expect(concluirDefinitiva).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    },
  );
});

describe('SYSTEM_ADMIN e reprovação com coluna de destino', () => {
  it('SYSTEM_ADMIN fora da fila pode iniciar', async () => {
    const { service, update } = construirServico(Roles.SYSTEM_ADMIN, {}, [
      'outro-usuario',
    ]);
    await service.iniciarTrabalho('os-1');
    expect(dadosDoUpdate(update).status).toBe(WorkOrderStatus.IN_PROGRESS);
  });

  function servicoReprovacao(
    nomeColuna: string,
    regionalColuna: string | null = null,
  ) {
    const base = construirServico(Roles.C2C, {
      type: WorkOrderType.CORRECTIVE,
      status: WorkOrderStatus.COMPLETED_UNDER_REVIEW,
    });
    Object.assign(base.service as object, {
      prisma: {
        workOrder: { update: base.update },
        workOrderColumn: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: 'col-campo',
            name: nomeColuna,
            regionalId: regionalColuna,
          }),
        },
        location: {
          findFirst: jest.fn<any>().mockResolvedValue({ regionalId: 'reg-1' }),
        },
      },
    });
    return base;
  }

  it('reprova levando a OS direto para a coluna escolhida', async () => {
    const { service, update } = servicoReprovacao('Equipe de campo');
    await service.reprovarConclusaoOrdem('os-1', {
      reason: 'Refazer',
      columnId: 'col-campo',
    } as any);
    const data = dadosDoUpdate(update);
    expect(data.status).toBe(WorkOrderStatus.IN_PROGRESS);
    expect(data.column).toEqual({ connect: { id: 'col-campo' } });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('não reprova para coluna que não é de execução', async () => {
    const { service, update } = servicoReprovacao('Pendentes');
    await expect(
      service.reprovarConclusaoOrdem('os-1', {
        reason: 'Refazer',
        columnId: 'col-campo',
      } as any),
    ).rejects.toThrow('coluna de execução');
    expect(update).not.toHaveBeenCalled();
  });

  it('não reprova para coluna de outra regional', async () => {
    const { service, update } = servicoReprovacao('Em andamento', 'reg-2');
    await expect(
      service.reprovarConclusaoOrdem('os-1', {
        reason: 'Refazer',
        columnId: 'col-campo',
      } as any),
    ).rejects.toThrow('outra regional');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('Mapeamento coluna → status (deve bater com o app)', () => {
  const statusPorColuna = (nome: string | null, tipo: WorkOrderType) =>
    (
      WorkOrdersService.prototype as unknown as {
        obterStatusPorNomeDaColuna(
          n: string | null,
          t?: WorkOrderType,
        ): WorkOrderStatus;
        resolverStatusConclusaoPorTipo(t: WorkOrderType): WorkOrderStatus;
      }
    ).obterStatusPorNomeDaColuna.call(
      Object.create(WorkOrdersService.prototype),
      nome,
      tipo,
    );

  // Mesma tabela de src/lib/field-team-guards.test.ts no app.
  it.each([
    ['Em andamento', WorkOrderType.CORRECTIVE, WorkOrderStatus.IN_PROGRESS],
    ['Execução', WorkOrderType.CORRECTIVE, WorkOrderStatus.IN_PROGRESS],
    ['Equipe de campo', WorkOrderType.CORRECTIVE, WorkOrderStatus.IN_PROGRESS],
    [
      'Monitoramento C2C',
      WorkOrderType.CORRECTIVE,
      WorkOrderStatus.IN_PROGRESS,
    ],
    [
      'Concluída',
      WorkOrderType.CORRECTIVE,
      WorkOrderStatus.COMPLETED_UNDER_REVIEW,
    ],
    ['Concluída', WorkOrderType.PREVENTIVE, WorkOrderStatus.COMPLETED],
    ['Finalizadas', WorkOrderType.GENERAL, WorkOrderStatus.COMPLETED],
    ['Atribuídas', WorkOrderType.CORRECTIVE, WorkOrderStatus.ASSIGNED],
    ['Pausadas', WorkOrderType.CORRECTIVE, WorkOrderStatus.PAUSED],
    ['Canceladas', WorkOrderType.CORRECTIVE, WorkOrderStatus.CANCELLED],
    ['Backlog', WorkOrderType.CORRECTIVE, WorkOrderStatus.PENDING],
  ])('"%s" (%s) → %s', (nome, tipo, esperado) => {
    expect(statusPorColuna(nome, tipo)).toBe(esperado);
  });
});

describe('Perfis liberados nas rotas (controller)', () => {
  const perfis = (metodo: string): string[] | undefined =>
    (
      Reflect.getMetadata(
        ROLE_BY_METHOD_KEY,
        (WorkOrdersController.prototype as unknown as Record<string, object>)[
          metodo
        ],
      ) as { PATCH?: string[] } | undefined
    )?.PATCH;

  it.each(['aprovarConclusaoOrdem', 'reprovarConclusaoOrdem'])(
    '%s aceita ADMIN, C2C e SYSTEM_ADMIN, e não FIELD_TEAM',
    (metodo) => {
      const lista = perfis(metodo);
      expect(lista).toEqual(
        expect.arrayContaining([Roles.ADMIN, Roles.C2C, Roles.SYSTEM_ADMIN]),
      );
      expect(lista).not.toContain(Roles.FIELD_TEAM);
    },
  );
});
