import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateMyNotificationPreferencesDto } from '../dto/update-my-notification-preferences.dto';
import {
  parseActivitiesNotification,
  PublicActivitiesNotification,
} from '../auth-me.mapper';

export type PublicNotificationPreferences = {
  notificationEmail: boolean;
  notificationPushNotification: boolean;
  activitiesNotification: PublicActivitiesNotification;
};

@Injectable()
export class MeNotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async updateByUserId(
    userId: string,
    dto: UpdateMyNotificationPreferencesDto,
  ): Promise<PublicNotificationPreferences> {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        notificationEmail: true,
        notificationPushNotification: true,
        activitiesNotification: true,
      },
    });

    if (!current) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const hasPatch =
      dto.notificationEmail !== undefined ||
      dto.notificationPushNotification !== undefined ||
      dto.activitiesNotification !== undefined;

    if (!hasPatch) {
      return {
        notificationEmail: current.notificationEmail,
        notificationPushNotification: current.notificationPushNotification,
        activitiesNotification: parseActivitiesNotification(
          current.activitiesNotification,
        ),
      };
    }

    const mergedActivities = parseActivitiesNotification(
      current.activitiesNotification,
    );
    if (dto.activitiesNotification) {
      const p = dto.activitiesNotification;
      if (p.assignments !== undefined) mergedActivities.assignments = p.assignments;
      if (p.comments !== undefined) mergedActivities.comments = p.comments;
      if (p.deadlines !== undefined) mergedActivities.deadlines = p.deadlines;
      if (p.reports !== undefined) mergedActivities.reports = p.reports;
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.notificationEmail !== undefined) {
      data.notificationEmail = dto.notificationEmail;
    }
    if (dto.notificationPushNotification !== undefined) {
      data.notificationPushNotification = dto.notificationPushNotification;
    }
    if (dto.activitiesNotification !== undefined) {
      data.activitiesNotification = mergedActivities as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        notificationEmail: true,
        notificationPushNotification: true,
        activitiesNotification: true,
      },
    });

    return {
      notificationEmail: updated.notificationEmail,
      notificationPushNotification: updated.notificationPushNotification,
      activitiesNotification: parseActivitiesNotification(
        updated.activitiesNotification,
      ),
    };
  }
}
