import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RecipientType, RecipientRule } from './notification.types';
import { Roles } from '@prisma/client';

/**
 * Destinatários de notificação (ALL, ADMINS_ONLY, SPECIFIC_USERS).
 */
@Injectable()
export class NotificationRecipientsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Obtém destinatários baseado no tipo e regras.
   */
  async getRecipients(
    companyId: string,
    recipientType: RecipientType,
    rule?: RecipientRule,
  ): Promise<string[]> {
    switch (recipientType) {
      case 'ALL':
        return this.getAllUsers(companyId);

      case 'ADMINS_ONLY':
        return this.getAdminsOnly(companyId);

      case 'SPECIFIC_USERS':
        return rule?.userIds || [];

      default:
        console.warn(`Tipo de destinatário não reconhecido: ${recipientType}`);
        return [];
    }
  }

  private async getAllUsers(companyId: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  private async getAdminsOnly(companyId: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        companyId,
        role: { in: [Roles.ADMIN, Roles.SYSTEM_ADMIN] },
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }
}
