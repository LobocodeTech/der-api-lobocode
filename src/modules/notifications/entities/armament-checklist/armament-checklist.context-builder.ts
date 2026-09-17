/**
 * 🔧 CONTEXT BUILDER - ARMAMENT CHECKLIST
 *
 * Constrói contexto rico para notificações de checklist de armamento.
 * Inclui dados relacionados como posto, usuário, etc.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { NotificationContext } from '../../shared/notification.types';
import { DateFormatter } from '../../shared/date-formatter';

@Injectable()
export class ArmamentChecklistContextBuilder {
  constructor(private prisma: PrismaService) {}

  /**
   * 🔫 ARMAMENT CHECKLIST - Contexto para checklist de armamento
   */
  async buildArmamentChecklistContext(
    checklistId: string,
    operation: string,
  ): Promise<NotificationContext> {
    const delegate = (this.prisma as any).armamentChecklist;
    if (!delegate) {
      return {
        userName: '',
        postName: '',
        time: DateFormatter.formatDateTime(new Date()),
      };
    }
    const checklist = await delegate.findUnique({
      where: { id: checklistId },
      include: {
        user: { select: { name: true } },
        shift: { include: { post: { select: { name: true } } } },
      },
    });
    if (!checklist) {
      throw new Error(`ArmamentChecklist não encontrado: ${checklistId}`);
    }
    const c = checklist as any;
    return {
      userName: c.userName ?? '',
      postName: c.shift?.post?.name ? ` no posto ${c.shift.post.name}` : '',
      time: DateFormatter.formatDateTime(new Date()),
    };
  }
}
