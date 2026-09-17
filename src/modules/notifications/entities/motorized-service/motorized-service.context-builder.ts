/**
 * 🔧 CONTEXT BUILDER - MOTORIZED SERVICE
 *
 * Constrói contexto rico para notificações de serviços motorizados.
 * Inclui dados relacionados como posto, usuário, etc.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { NotificationContext } from '../../shared/notification.types';
import { DateFormatter } from '../../shared/date-formatter';

@Injectable()
export class MotorizedServiceContextBuilder {
  constructor(private prisma: PrismaService) {}

  /**
   * 🚛 MOTORIZED SERVICE - Contexto para serviços motorizados
   */
  async buildMotorizedServiceContext(
    serviceId: string,
    operation: string,
  ): Promise<NotificationContext> {
    const delegate = (this.prisma as any).motorizedService;
    if (!delegate) {
      return {
        userName: '',
        postName: '',
        time: DateFormatter.formatDateTime(new Date()),
      };
    }
    const service = await delegate.findUnique({
      where: { id: serviceId },
      include: {
        user: { select: { name: true } },
        shift: { include: { post: { select: { name: true } } } },
      },
    });
    if (!service) {
      throw new Error(`MotorizedService não encontrado: ${serviceId}`);
    }
    const s = service as any;
    return {
      userName: s.userName ?? '',
      postName: s.shift?.post?.name ? ` no posto ${s.shift.post.name}` : '',
      time: DateFormatter.formatDateTime(new Date()),
    };
  }
}
