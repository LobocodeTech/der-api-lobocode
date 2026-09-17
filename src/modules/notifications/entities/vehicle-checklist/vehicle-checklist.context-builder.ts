/**
 * 🔧 CONTEXT BUILDER - VEHICLE CHECKLIST
 *
 * Constrói contexto rico para notificações de checklist de veículos.
 * Inclui dados relacionados como posto, veículo, usuário, etc.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { NotificationContext } from '../../shared/notification.types';
import { DateFormatter } from '../../shared/date-formatter';

@Injectable()
export class VehicleChecklistContextBuilder {
  constructor(private prisma: PrismaService) {}

  /**
   * 🚗 VEHICLE CHECKLIST - Contexto para checklist de veículos
   */
  async buildVehicleChecklistContext(
    checklistId: string,
    operation: string,
  ): Promise<NotificationContext> {
    const checklistDelegate = (this.prisma as any).vehicleChecklist;
    if (!checklistDelegate) {
      return {
        userName: '',
        postName: '',
        time: DateFormatter.formatDateTime(new Date()),
        vehiclePlate: undefined,
        vehicleModel: undefined,
      };
    }
    const checklist = await checklistDelegate.findUnique({
      where: { id: checklistId },
      include: {
        vehicle: { select: { plate: true, model: true } },
        user: { select: { name: true } },
        shift: {
          include: {
            post: { select: { name: true } },
          },
        },
      },
    });

    if (!checklist) {
      throw new Error(`VehicleChecklist não encontrado: ${checklistId}`);
    }

    const c = checklist as any;
    return {
      userName: c.userName ?? '',
      postName: c.shift?.post?.name ? ` no posto ${c.shift.post.name}` : '',
      time: DateFormatter.formatDateTime(new Date()),
      vehiclePlate: c.vehicle?.plate,
      vehicleModel: c.vehicle?.model,
    };
  }
}
