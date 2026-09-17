/**
 * 🔧 CONTEXT BUILDER - USER
 *
 * Constrói contexto rico para notificações de usuários.
 * Inclui dados relacionados como nome, etc.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { NotificationContext } from '../../shared/notification.types';
import { DateFormatter } from '../../shared/date-formatter';

@Injectable()
export class UserContextBuilder {
  constructor(private prisma: PrismaService) {}

  /**
   * 👥 USER - Contexto para usuários
   */
  async buildUserContext(
    userId: string,
    operation: string,
  ): Promise<NotificationContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    if (!user) {
      throw new Error(`User não encontrado: ${userId}`);
    }

    return {
      userName: user.name,
      postName: '', // Para usuários, não há posto específico
      time: DateFormatter.formatDateTime(new Date()),
    };
  }
}
