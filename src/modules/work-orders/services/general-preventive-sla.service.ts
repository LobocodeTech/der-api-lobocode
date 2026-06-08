import { Injectable } from '@nestjs/common';
import { WorkOrderSlaStatus, WorkOrderStatus } from '@prisma/client';
import { calcularSlaStatusGeralPreventiva } from '../utils/general-preventive-sla.util';

@Injectable()
export class GeneralPreventiveSlaService {
  calcularSlaStatus(
    dueDate: Date | null | undefined,
    status: WorkOrderStatus,
    agora: Date = new Date(),
    completedAt?: Date | null,
  ): WorkOrderSlaStatus {
    return calcularSlaStatusGeralPreventiva(
      dueDate,
      status,
      agora,
      completedAt,
    );
  }
}
