/**
 * 🔧 CONTEXT BUILDER - SHIFT
 *
 * Constrói contexto rico para notificações de turnos.
 * Inclui dados relacionados como posto, usuário, status, etc.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { NotificationContext } from '../../shared/notification.types';
import { DateFormatter } from '../../shared/date-formatter';

@Injectable()
export class ShiftContextBuilder {
  constructor(private prisma: PrismaService) {}

  /**
   * 🕐 SHIFT - Contexto para turnos
   */
  async buildShiftContext(
    shiftId: string,
    operation: string,
  ): Promise<NotificationContext> {
    const shiftDelegate = (this.prisma as any).shift;
    if (!shiftDelegate) {
      return {
        userName: '',
        postName: '',
        time: DateFormatter.formatDateTime(new Date()),
        shiftStatus: '',
      };
    }
    const shift = await shiftDelegate.findUnique({
      where: { id: shiftId },
      include: {
        post: { select: { name: true } },
        user: { select: { name: true } },
      },
    });
    if (!shift) {
      throw new Error(`Shift não encontrado: ${shiftId}`);
    }
    return {
      userName: (shift as any).user?.name ?? '',
      postName: (shift as any).post?.name
        ? ` no posto ${(shift as any).post.name}`
        : '',
      time: DateFormatter.formatDateTime(new Date()),
      shiftStatus: (shift as any).status ?? '',
    };
  }
}
