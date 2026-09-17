import { Injectable } from '@nestjs/common';
import { CaslService } from '../casl.service';
import { CrudAction } from '../casl.service';
import { Roles, User } from '@prisma/client';
import { EntityNameCasl } from 'src/shared/universal/types';

export interface PermissionContext {
  user: User;
  companyId?: string;
  postId?: string;
  shiftId?: string;
  patrolId?: string;
  timeOfDay?: 'day' | 'night';
  isOnShift?: boolean;
  isOnPatrol?: boolean;
}

export interface DynamicPermission {
  action: CrudAction;
  subject: string;
  conditions?: Record<string, any>;
  timeRestrictions?: {
    startHour?: number;
    endHour?: number;
  };
  shiftRestrictions?: {
    requiresActiveShift?: boolean;
    requiresActivePatrol?: boolean;
  };
}

@Injectable()
export class PermissionContextService {
  constructor(private caslService: CaslService) {}

  // ============================================================================
  // 📋 MÉTODOS PÚBLICOS - VALIDAÇÃO CONTEXTUAL
  // ============================================================================

  /**
   * Valida permissão considerando contexto dinâmico
   */
  validarPermissaoContextual(
    context: PermissionContext,
    permission: DynamicPermission,
  ): boolean {
    // Validação básica CASL
    const basicValidation = this.caslService.validarAction(
      permission.action,
      permission.subject as EntityNameCasl,
    );

    if (!basicValidation) {
      return false;
    }

    // Validações contextuais
    const timeValidation = this.validarRestricaoTemporal(context, permission);
    const shiftValidation = this.validarRestricaoTurno(context, permission);
    const conditionValidation = this.validarCondicoes(context, permission);

    return timeValidation && shiftValidation && conditionValidation;
  }

  /**
   * Valida permissão para operações de turno
   */
  validarPermissaoTurno(
    context: PermissionContext,
    action: CrudAction,
  ): boolean {
    const permission: DynamicPermission = {
      action,
      subject: 'Shift',
      shiftRestrictions: {
        requiresActiveShift: true,
      },
    };

    return this.validarPermissaoContextual(context, permission);
  }

  /**
   * Valida permissão para operações de ronda
   */
  validarPermissaoRonda(
    context: PermissionContext,
    action: CrudAction,
  ): boolean {
    const permission: DynamicPermission = {
      action,
      subject: 'Patrol',
      shiftRestrictions: {
        requiresActiveShift: true,
        requiresActivePatrol: true,
      },
    };

    return this.validarPermissaoContextual(context, permission);
  }

  /**
   * Valida permissão para operações de posto
   */
  validarPermissaoPosto(
    context: PermissionContext,
    action: CrudAction,
    postId?: string,
  ): boolean {
    const targetPostId = postId || context.postId;

    if (!targetPostId) {
      return false;
    }

    const permission: DynamicPermission = {
      action,
      subject: 'Post',
      conditions: {
        id: targetPostId,
        companyId: context.companyId,
      },
    };

    return this.validarPermissaoContextual(context, permission);
  }

  /**
   * Valida permissão para operações de emergência (pânico)
   */
  validarPermissaoEmergencia(context: PermissionContext): boolean {
    const permission: DynamicPermission = {
      action: 'create',
      subject: 'PanicEvent',
      conditions: {
        companyId: context.companyId,
        postId: context.postId,
      },
    };

    return this.validarPermissaoContextual(context, permission);
  }

  // ============================================================================
  // 🔧 MÉTODOS PRIVADOS - LÓGICA DE VALIDAÇÃO
  // ============================================================================

  /**
   * Valida restrições temporais
   */
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

  /**
   * Valida restrições de turno
   */
  private validarRestricaoTurno(
    context: PermissionContext,
    permission: DynamicPermission,
  ): boolean {
    if (!permission.shiftRestrictions) {
      return true;
    }

    if (
      permission.shiftRestrictions.requiresActiveShift &&
      !context.isOnShift
    ) {
      return false;
    }

    if (
      permission.shiftRestrictions.requiresActivePatrol &&
      !context.isOnPatrol
    ) {
      return false;
    }

    return true;
  }

  /**
   * Valida condições específicas
   */
  private validarCondicoes(
    context: PermissionContext,
    permission: DynamicPermission,
  ): boolean {
    if (!permission.conditions) {
      return true;
    }

    // Validação de companyId
    if (permission.conditions.companyId && context.companyId) {
      if (permission.conditions.companyId !== context.companyId) {
        return false;
      }
    }

    // Validação de postId
    if (permission.conditions.postId && context.postId) {
      if (permission.conditions.postId !== context.postId) {
        return false;
      }
    }

    // Validação de role específico
    if (permission.conditions.role) {
      if (context.user.role !== permission.conditions.role) {
        return false;
      }
    }

    return true;
  }

  /**
   * Cria contexto de permissão a partir do usuário
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

  /**
   * Verifica se usuário está em turno ativo
   */
  async verificarTurnoAtivo(userId: string): Promise<boolean> {
    // TODO: Implementar verificação de turno ativo
    // Esta lógica será implementada quando o módulo de turnos estiver pronto
    return true;
  }

  /**
   * Verifica se usuário está em ronda ativa
   */
  async verificarRondaAtiva(userId: string): Promise<boolean> {
    // TODO: Implementar verificação de ronda ativa
    // Esta lógica será implementada quando o módulo de rondas estiver pronto
    return false;
  }
}
