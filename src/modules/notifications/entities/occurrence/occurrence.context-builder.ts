/**
 * 🔧 CONTEXT BUILDER - OCCURRENCE
 *
 * Constrói contexto rico para notificações de ocorrências.
 * Inclui dados relacionados como posto, usuário, etc.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { NotificationContext } from '../../shared/notification.types';
import { DateFormatter } from '../../shared/date-formatter';

@Injectable()
export class OccurrenceContextBuilder {
  constructor(private prisma: PrismaService) {}

  /**
   * 🚨 OCCURRENCE - Contexto para ocorrências
   */
  async buildOccurrenceContext(
    occurrenceId: string,
    operation: string,
  ): Promise<NotificationContext> {
    const occurrenceDelegate = (this.prisma as any).occurrence;
    if (!occurrenceDelegate) {
      return {
        userName: '',
        postName: '',
        time: DateFormatter.formatDateTime(new Date()),
      };
    }
    const occurrence = await occurrenceDelegate.findUnique({
      where: { id: occurrenceId },
      include: {
        post: { select: { name: true } },
        user: { select: { name: true } },
      },
    });

    if (!occurrence) {
      throw new Error(`Occurrence não encontrado: ${occurrenceId}`);
    }

    return {
      userName: (occurrence as any).user?.name ?? '',
      postName: (occurrence as any).post?.name
        ? ` no posto ${(occurrence as any).post.name}`
        : '',
      time: DateFormatter.formatDateTime(new Date()),
    };
  }
}
