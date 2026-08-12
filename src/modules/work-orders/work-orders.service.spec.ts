import {
  Prisma,
  WorkOrderSlaStatus,
  WorkOrderStatus,
  WorkOrderType,
} from '@prisma/client';
import { describe, expect, it } from '@jest/globals';
import { WorkOrdersService } from './work-orders.service';

describe('WorkOrdersService - filtro de SLA atrasado', () => {
  it('não considera concluída no prazo como atrasada apenas porque o prazo já passou', () => {
    const whereOverdue = (
      WorkOrdersService.prototype as unknown as {
        whereOverdue(this: {
          ymdHoje(): string;
          inicioDoDiaUtc(ymd: string): Date;
        }): Prisma.WorkOrderWhereInput;
      }
    ).whereOverdue;

    const where = whereOverdue.call({
      ymdHoje: () => '2026-08-12',
      inicioDoDiaUtc: (ymd: string) => new Date(`${ymd}T00:00:00.000Z`),
    });

    expect(where).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          {
            type: {
              in: [WorkOrderType.PREVENTIVE, WorkOrderType.GENERAL],
            },
            OR: [
              { slaStatus: WorkOrderSlaStatus.OVERDUE },
              {
                status: {
                  notIn: [
                    WorkOrderStatus.COMPLETED,
                    WorkOrderStatus.CANCELLED,
                  ],
                },
                dueDate: { lt: new Date('2026-08-12T00:00:00.000Z') },
              },
            ],
          },
        ]),
      }),
    );
  });
});
