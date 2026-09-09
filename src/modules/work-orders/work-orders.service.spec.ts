import {
  WorkOrderCorrectiveSlaStatus,
  Roles,
  WorkOrderStatus,
} from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { WorkOrdersService } from './work-orders.service';

describe('WorkOrdersService - filtro de SLA atrasado', () => {
  const companyConfig = {
    correctiveSlaDefaultSeconds: 43_200,
    correctiveSlaWindowStart: '06:00',
    correctiveSlaWindowEnd: '18:00',
  };
  const agora = new Date('2026-08-12T15:00:00.000Z');
  const registroEstaAtrasadoAoVivo = (
    (
      WorkOrdersService.prototype as unknown as {
        registroEstaAtrasadoAoVivo?(
          registro: Record<string, unknown>,
          config: typeof companyConfig,
          agora: Date,
        ): boolean;
      }
    ).registroEstaAtrasadoAoVivo
  );

  it('distingue preventiva concluída no prazo de preventiva concluída atrasada', () => {
    const base = {
      type: 'PREVENTIVE',
      status: WorkOrderStatus.COMPLETED,
      dueDate: new Date('2026-08-10T03:00:00.000Z'),
      slaStatus: 'OK',
    };

    const concluidaNoPrazo = registroEstaAtrasadoAoVivo?.(
      {
        ...base,
        completedAt: new Date('2026-08-10T20:00:00.000Z'),
      },
      companyConfig,
      agora,
    );
    const concluidaAtrasada = registroEstaAtrasadoAoVivo?.(
      {
        ...base,
        completedAt: new Date('2026-08-11T03:00:00.000Z'),
      },
      companyConfig,
      agora,
    );

    expect(concluidaNoPrazo).toBe(false);
    expect(concluidaAtrasada).toBe(true);
  });

  it('conta corretiva ativa cujo limite venceu sem status persistido', () => {
    const atrasada = registroEstaAtrasadoAoVivo?.(
      {
        type: 'CORRECTIVE',
        status: WorkOrderStatus.IN_PROGRESS,
        slaStartAt: new Date('2026-08-10T09:00:00.000Z'),
        slaDeadlineAt: new Date('2026-08-11T15:00:00.000Z'),
        slaPausedAt: null,
        slaResumedAt: null,
        slaConsumedSeconds: 10_800,
        slaStatusExtended: WorkOrderCorrectiveSlaStatus.IN_PROGRESS,
        slaExceededAt: null,
        completedAt: null,
        finalApprovalCompletedAt: null,
      },
      companyConfig,
      agora,
    );

    expect(atrasada).toBe(true);
  });
});

describe('WorkOrdersService - escopo de ações por fila', () => {
  const construirServico = (usuario: {
    id: string;
    role: Roles;
    regionalId?: string | null;
  }) => {
    const findFirst = jest.fn() as jest.Mock<any>;
    findFirst.mockResolvedValue({ id: 'os-1' });
    const service = {
      obterCompanyId: () => 'empresa-1',
      obterUsuarioLogado: () => usuario,
      prisma: {
        workOrder: { findFirst },
      },
    } as unknown as WorkOrdersService;

    return { service, findFirst };
  };

  const buscarOrdemPorId = (
    service: WorkOrdersService,
    id: string,
  ): Promise<unknown> =>
    (
      WorkOrdersService.prototype as unknown as {
        buscarOrdemPorId(
          id: string,
        ): Promise<unknown>;
      }
    ).buscarOrdemPorId.call(service, id);

  it('aplica associação à fila para FIELD_TEAM mesmo na mesma regional', async () => {
    const { service, findFirst } = construirServico({
      id: 'tecnico-1',
      role: Roles.FIELD_TEAM,
      regionalId: 'regional-1',
    });

    await buscarOrdemPorId(service, 'os-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workOrderQueues: {
            some: {
              queue: { queueUsers: { some: { userId: 'tecnico-1' } } },
            },
          },
        }),
      }),
    );
  });

  it('mantém a OS acessível para FIELD_TEAM associado sem regional', async () => {
    const { service, findFirst } = construirServico({
      id: 'tecnico-1',
      role: Roles.FIELD_TEAM,
      regionalId: null,
    });

    await buscarOrdemPorId(service, 'os-1');

    const query = findFirst.mock.calls[0][0] as any;
    expect(query.where.workOrderQueues).toBeDefined();
  });

  it('não encontra OS de FIELD_TEAM da mesma regional sem associação à fila', async () => {
    const { service, findFirst } = construirServico({
      id: 'tecnico-1',
      role: Roles.FIELD_TEAM,
      regionalId: 'regional-1',
    });
    findFirst.mockResolvedValue(null);

    await expect(buscarOrdemPorId(service, 'os-1')).rejects.toThrow(
      'Ordem de serviço não encontrada.',
    );

    const query = findFirst.mock.calls[0][0] as any;
    expect(query.where.workOrderQueues).toBeDefined();
    expect(query.where.location).toBeUndefined();
  });

  it.each([Roles.ADMIN, Roles.SYSTEM_ADMIN, Roles.C2C])(
    'não aplica filtro de fila para %s',
    async (role) => {
      const { service, findFirst } = construirServico({
        id: 'usuario-1',
        role,
        regionalId: 'regional-1',
      });

      await buscarOrdemPorId(service, 'os-1');

      const query = findFirst.mock.calls[0][0] as any;
      expect(query.where.workOrderQueues).toBeUndefined();
    },
  );
});
