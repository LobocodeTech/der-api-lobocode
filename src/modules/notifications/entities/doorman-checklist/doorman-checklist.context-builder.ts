/**
 * 🔧 CONTEXT BUILDER - DOORMAN CHECKLIST
 *
 * Constrói contexto rico para notificações de checklist de porteiro.
 * Inclui dados relacionados como posto, usuário, etc.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { NotificationContext } from '../../shared/notification.types';
import { DateFormatter } from '../../shared/date-formatter';

@Injectable()
export class DoormanChecklistContextBuilder {
  constructor(private prisma: PrismaService) {}

  /**
   * 🚪 DOORMAN CHECKLIST - Contexto para checklist de porteiro
   */
  async buildDoormanChecklistContext(
    checklistId: string,
    operation: string,
  ): Promise<NotificationContext> {
    const delegate = (this.prisma as any).doormanChecklist;
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
      throw new Error(`DoormanChecklist não encontrado: ${checklistId}`);
    }
    const c = checklist as any;
    return {
      userName: c.userName ?? '',
      postName: c.shift?.post?.name ? ` no posto ${c.shift.post.name}` : '',
      time: DateFormatter.formatDateTime(new Date()),
    };
  }
}
