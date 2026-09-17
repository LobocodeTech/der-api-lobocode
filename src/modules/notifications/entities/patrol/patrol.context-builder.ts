/**
 * 🔧 CONTEXT BUILDER - PATROL
 *
 * Constrói contexto rico para notificações de Rondas.
 * Inclui dados relacionados como posto, usuário, etc.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { NotificationContext } from '../../shared/notification.types';
import { DateFormatter } from '../../shared/date-formatter';

@Injectable()
export class PatrolContextBuilder {
  constructor(private prisma: PrismaService) {}

  /**
   * 🚶 PATROL - Contexto para Rondas
   */
  async buildPatrolContext(
    patrolId: string,
    operation: string,
  ): Promise<NotificationContext> {
    const patrolDelegate = (this.prisma as any).patrol;
    if (!patrolDelegate) {
      return {
        userName: '',
        postName: '',
        time: DateFormatter.formatDateTime(new Date()),
      };
    }
    const patrol = await patrolDelegate.findUnique({
      where: { id: patrolId },
      include: {
        user: { select: { name: true } },
        shift: {
          include: {
            post: { select: { name: true } },
          },
        },
      },
    });

    if (!patrol) {
      throw new Error(`Patrol não encontrado: ${patrolId}`);
    }
    return {
      userName: (patrol as any).user?.name ?? '',
      postName: (patrol as any).shift?.post?.name
        ? ` no posto ${(patrol as any).shift.post.name}`
        : '',
      time: DateFormatter.formatDateTime(new Date()),
    };
  }

  /**
   * 🚶 PATROL CHECKPOINT - Contexto para checkpoints de Ronda
   */
  async buildPatrolCheckpointContext(
    patrolId: string,
    checkpointName: string,
    operation: string,
  ): Promise<NotificationContext> {
    const patrolDelegate = (this.prisma as any).patrol;
    if (!patrolDelegate) {
      return {
        userName: '',
        postName: '',
        time: DateFormatter.formatDateTime(new Date()),
      };
    }
    const patrol = await patrolDelegate.findUnique({
      where: { id: patrolId },
      include: {
        user: { select: { name: true } },
        shift: {
          include: {
            post: { select: { name: true } },
          },
        },
      },
    });

    if (!patrol) {
      throw new Error(`Patrol não encontrado: ${patrolId}`);
    }

    return {
      userName: (patrol as any).user?.name ?? '',
      postName: (patrol as any).shift?.post?.name
        ? ` no posto ${(patrol as any).shift.post.name}`
        : '',
      time: DateFormatter.formatDateTime(new Date()),
      checkpointName: checkpointName,
    };
  }
}
