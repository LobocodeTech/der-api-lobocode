import { Injectable } from '@nestjs/common';
import { CaslService } from '../casl.service';
import { CrudAction } from '../casl.service';
import { User } from '@prisma/client';
import { EntityNameCasl } from 'src/shared/universal/types';

export interface PermissionContext {
  user: User;
  companyId?: string;
  timeOfDay?: 'day' | 'night';
}

export interface DynamicPermission {
  action: CrudAction;
  subject: string;
  conditions?: Record<string, any>;
  timeRestrictions?: {
    startHour?: number;
    endHour?: number;
  };
}

@Injectable()
export class PermissionContextService {
  constructor(private caslService: CaslService) {}

  /**
   * Valida permissão considerando contexto dinâmico (CASL + tempo + condições).
   */
  validarPermissaoContextual(
    context: PermissionContext,
    permission: DynamicPermission,
  ): boolean {
    const basicValidation = this.caslService.validarAction(
      permission.action,
      permission.subject as EntityNameCasl,
    );

    if (!basicValidation) {
      return false;
    }

    const timeValidation = this.validarRestricaoTemporal(context, permission);
    const conditionValidation = this.validarCondicoes(context, permission);

    return timeValidation && conditionValidation;
  }

  private validarRestricaoTemporal(
    context: PermissionContext,
    permission: DynamicPermission,
  ): boolean {
    if (!permission.timeRestrictions) {
      return true;
    }

    const now = new Date();
    const currentHour = now.getHours();

    if (
      permission.timeRestrictions.startHour &&
      permission.timeRestrictions.endHour
    ) {
      return (
        currentHour >= permission.timeRestrictions.startHour &&
        currentHour <= permission.timeRestrictions.endHour
      );
    }

    return true;
  }

  private validarCondicoes(
    context: PermissionContext,
    permission: DynamicPermission,
  ): boolean {
    if (!permission.conditions) {
      return true;
    }

    if (permission.conditions.companyId && context.companyId) {
      if (permission.conditions.companyId !== context.companyId) {
        return false;
      }
    }

    if (permission.conditions.role) {
      if (context.user.role !== permission.conditions.role) {
        return false;
      }
    }

    return true;
  }

  /**
   * Cria contexto de permissão a partir do usuário.
   */
  criarContexto(
    user: User,
    additionalData?: Partial<PermissionContext>,
  ): PermissionContext {
    return {
      user,
      companyId: user.companyId || undefined,
      ...additionalData,
    };
  }
}
