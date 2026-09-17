/**
 * 🔧 CONTEXT BUILDER - SUPPLY
 *
 * Constrói contexto rico para notificações de abastecimentos.
 * Inclui dados relacionados como posto, veículo, usuário, etc.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { NotificationContext } from '../../shared/notification.types';
import { DateFormatter } from '../../shared/date-formatter';

@Injectable()
export class SupplyContextBuilder {
  constructor(private prisma: PrismaService) {}

  /**
   * 📋 SUPPLY - Contexto para abastecimentos
   */
  async buildSupplyContext(
    supplyId: string,
    operation: string,
  ): Promise<NotificationContext> {
    const delegate = (this.prisma as any).supply;
    if (!delegate) {
      return {
        userName: '',
        postName: '',
        time: DateFormatter.formatDateTime(new Date()),
        liters: 0,
        talaoNumber: undefined,
        vehiclePlate: undefined,
        vehicleModel: undefined,
      };
    }
    const supply = await delegate.findUnique({
      where: { id: supplyId },
      include: {
        post: { select: { name: true } },
        vehicle: { select: { plate: true, model: true } },
        user: { select: { name: true } },
      },
    });
    if (!supply) {
      throw new Error(`Supply não encontrado: ${supplyId}`);
    }
    const s = supply as any;
    return {
      userName: s.user?.name ?? '',
      postName: s.post?.name ?? '',
      time: DateFormatter.formatDateTime(new Date()),
      liters: s.liters || 0,
      talaoNumber: s.talaoNumber,
      vehiclePlate: s.vehicle?.plate,
      vehicleModel: s.vehicle?.model,
    };
  }
}
