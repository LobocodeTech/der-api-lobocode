import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  parseActivitiesNotification,
  PublicActivitiesNotification,
} from '../../../shared/auth/auth-me.mapper';

export type ActivityPreferenceKey = keyof PublicActivitiesNotification;

@Injectable()
export class ActivityNotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async filtrarUsuariosComPreferenciaAtiva(
    userIds: string[],
    preference: ActivityPreferenceKey,
  ): Promise<string[]> {
    const uniqueIds = Array.from(
      new Set(userIds.map((id) => id?.trim()).filter(Boolean)),
    );
    if (uniqueIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: uniqueIds },
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        activitiesNotification: true,
      },
    });

    return users
      .filter(
        (user) =>
          parseActivitiesNotification(user.activitiesNotification)[preference],
      )
      .map((user) => user.id);
  }
}
