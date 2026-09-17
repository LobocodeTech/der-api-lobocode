/**
 * 🔧 CONTEXT BUILDER - OCCURRENCE DISPATCH
 *
 * Constrói contexto rico para notificações de despacho de ocorrências.
 * Inclui dados relacionados como posto, usuário, etc.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { NotificationContext } from '../../shared/notification.types';
import { DateFormatter } from '../../shared/date-formatter';

@Injectable()
export class OccurrenceDispatchContextBuilder {
  constructor(private prisma: PrismaService) {}

  /**
   * 🚨 OCCURRENCE DISPATCH - Contexto para despacho de ocorrências
   */
  async buildOccurrenceDispatchContext(
    dispatchId: string,
    operation: string,
  ): Promise<NotificationContext> {
    const dispatchDelegate = (this.prisma as any).occurrenceDispatch;
    if (!dispatchDelegate) {
      return {
        userName: '',
        postName: '',
        time: DateFormatter.formatDateTime(new Date()),
        guardId: undefined,
        guardName: '',
      };
    }
    const dispatch = await dispatchDelegate.findUnique({
      where: { id: dispatchId },
      include: {
        user: { select: { name: true } },
        shift: {
          include: {
            post: { select: { name: true } },
          },
        },
        guard: { select: { name: true } }, // Buscar dados do guarda
      },
    });

    if (!dispatch) {
      throw new Error(`OccurrenceDispatch não encontrado: ${dispatchId}`);
    }

    const d = dispatch as any;
    return {
      userName: d.userName ?? '',
      postName: d.shift?.post?.name ? ` no posto ${d.shift.post.name}` : '',
      time: DateFormatter.formatDateTime(new Date()),
      guardId: d.guardId || undefined,
      guardName: d.guard?.name || 'Vigilante não identificado',
    };
  }
}
