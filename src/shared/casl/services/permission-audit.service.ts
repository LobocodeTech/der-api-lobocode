import { Injectable, Logger } from '@nestjs/common';
import { CaslService } from '../casl.service';
import { CrudAction } from '../casl.service';
import { User } from '@prisma/client';
import { EntityNameCasl } from 'src/shared/universal/types';

export interface PermissionAuditLog {
  userId: string;
  userRole: string;
  action: CrudAction;
  subject: string;
  resourceId?: string;
  companyId?: string;
  postId?: string;
  timestamp: Date;
  success: boolean;
  ipAddress?: string;
  userAgent?: string;
  context?: Record<string, any>;
}

export interface PermissionMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  mostRequestedActions: Array<{
    action: string;
    subject: string;
    count: number;
  }>;
  mostDeniedActions: Array<{
    action: string;
    subject: string;
    count: number;
  }>;
  requestsByRole: Record<string, number>;
  requestsByCompany: Record<string, number>;
}

@Injectable()
export class PermissionAuditService {
  private readonly logger = new Logger(PermissionAuditService.name);
  private auditLogs: PermissionAuditLog[] = [];
  private readonly MAX_LOGS = 10000; // Limite de logs em memória

  constructor(private caslService: CaslService) {}

  // ============================================================================
  // 📋 MÉTODOS PÚBLICOS - AUDITORIA
  // ============================================================================

  /**
   * Registra tentativa de acesso
   */
  registrarTentativa(
    user: User,
    action: CrudAction,
    subject: string,
    success: boolean,
    context?: {
      resourceId?: string;
      companyId?: string;
      postId?: string;
      ipAddress?: string;
      userAgent?: string;
      additionalContext?: Record<string, any>;
    },
  ): void {
    const auditLog: PermissionAuditLog = {
      userId: user.id,
      userRole: user.role,
      action,
      subject,
      resourceId: context?.resourceId,
      companyId: context?.companyId || user.companyId || undefined,
      postId: context?.postId,
      timestamp: new Date(),
      success,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      context: context?.additionalContext,
    };

    this.adicionarLog(auditLog);

    // Log para monitoramento
    if (!success) {
      this.logger.warn(
        `Acesso negado: ${user.role} (${user.id}) tentou ${action} em ${subject}`,
        {
          userId: user.id,
          userRole: user.role,
          action,
          subject,
          companyId: user.companyId,
        },
      );
    }
  }

  /**
   * Valida permissão e registra auditoria
   */
  validarComAuditoria(
    user: User,
    action: CrudAction,
    subject: string,
    context?: {
      resourceId?: string;
      companyId?: string;
      postId?: string;
      ipAddress?: string;
      userAgent?: string;
      additionalContext?: Record<string, any>;
    },
  ): boolean {
    try {
      const success = this.caslService.validarAction(
        action,
        subject as EntityNameCasl,
      );

      this.registrarTentativa(user, action, subject, success, context);

      return success;
    } catch (error) {
      this.registrarTentativa(user, action, subject, false, context);
      throw error;
    }
  }

  /**
   * Obtém métricas de permissões
   */
  obterMetricas(periodo?: { inicio: Date; fim: Date }): PermissionMetrics {
    let logs = this.auditLogs;

    // Filtrar por período se especificado
    if (periodo) {
      logs = logs.filter(
        (log) =>
          log.timestamp >= periodo.inicio && log.timestamp <= periodo.fim,
      );
    }

    const totalRequests = logs.length;
    const successfulRequests = logs.filter((log) => log.success).length;
    const failedRequests = totalRequests - successfulRequests;
    const successRate =
      totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;

    // Ações mais solicitadas
    const actionCounts = new Map<string, number>();
    logs.forEach((log) => {
      const key = `${log.action}:${log.subject}`;
      actionCounts.set(key, (actionCounts.get(key) || 0) + 1);
    });

    const mostRequestedActions = Array.from(actionCounts.entries())
      .map(([key, count]) => {
        const [action, subject] = key.split(':');
        return { action, subject, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Ações mais negadas
    const deniedActionCounts = new Map<string, number>();
    logs
      .filter((log) => !log.success)
      .forEach((log) => {
        const key = `${log.action}:${log.subject}`;
        deniedActionCounts.set(key, (deniedActionCounts.get(key) || 0) + 1);
      });

    const mostDeniedActions = Array.from(deniedActionCounts.entries())
      .map(([key, count]) => {
        const [action, subject] = key.split(':');
        return { action, subject, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Requisições por role
    const requestsByRole: Record<string, number> = {};
    logs.forEach((log) => {
      requestsByRole[log.userRole] = (requestsByRole[log.userRole] || 0) + 1;
    });

    // Requisições por empresa
    const requestsByCompany: Record<string, number> = {};
    logs.forEach((log) => {
      if (log.companyId) {
        requestsByCompany[log.companyId] =
          (requestsByCompany[log.companyId] || 0) + 1;
      }
    });

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      successRate,
      mostRequestedActions,
      mostDeniedActions,
      requestsByRole,
      requestsByCompany,
    };
  }

  /**
   * Obtém logs de auditoria
   */
  obterLogs(
    filtros?: {
      userId?: string;
      userRole?: string;
      action?: CrudAction;
      subject?: string;
      success?: boolean;
      companyId?: string;
      inicio?: Date;
      fim?: Date;
    },
    limit = 100,
  ): PermissionAuditLog[] {
    let logs = this.auditLogs;

    // Aplicar filtros
    if (filtros?.userId) {
      logs = logs.filter((log) => log.userId === filtros.userId);
    }

    if (filtros?.userRole) {
      logs = logs.filter((log) => log.userRole === filtros.userRole);
    }

    if (filtros?.action) {
      logs = logs.filter((log) => log.action === filtros.action);
    }

    if (filtros?.subject) {
      logs = logs.filter((log) => log.subject === filtros.subject);
    }

    if (filtros?.success !== undefined) {
      logs = logs.filter((log) => log.success === filtros.success);
    }

    if (filtros?.companyId) {
      logs = logs.filter((log) => log.companyId === filtros.companyId);
    }

    if (filtros?.inicio) {
      logs = logs.filter((log) => log.timestamp >= filtros.inicio!);
    }

    if (filtros?.fim) {
      logs = logs.filter((log) => log.timestamp <= filtros.fim!);
    }

    // Ordenar por timestamp (mais recente primeiro)
    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return logs.slice(0, limit);
  }

  /**
   * Limpa logs antigos
   */
  limparLogsAntigos(dias: number = 30): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - dias);

    this.auditLogs = this.auditLogs.filter(
      (log) => log.timestamp >= cutoffDate,
    );

    this.logger.log(
      `Logs antigos removidos. ${this.auditLogs.length} logs mantidos.`,
    );
  }

  /**
   * Exporta logs para análise
   */
  exportarLogs(formato: 'json' | 'csv' = 'json'): string {
    if (formato === 'csv') {
      return this.exportarParaCSV();
    }

    return JSON.stringify(this.auditLogs, null, 2);
  }

  // ============================================================================
  // 🔧 MÉTODOS PRIVADOS - UTILITÁRIOS
  // ============================================================================

  /**
   * Adiciona log mantendo limite de memória
   */
  private adicionarLog(log: PermissionAuditLog): void {
    this.auditLogs.push(log);

    // Manter limite de logs em memória
    if (this.auditLogs.length > this.MAX_LOGS) {
      this.auditLogs = this.auditLogs.slice(-this.MAX_LOGS);
    }
  }

  /**
   * Exporta logs para CSV
   */
  private exportarParaCSV(): string {
    if (this.auditLogs.length === 0) {
      return '';
    }

    const headers = [
      'userId',
      'userRole',
      'action',
      'subject',
      'resourceId',
      'companyId',
      'postId',
      'timestamp',
      'success',
      'ipAddress',
      'userAgent',
    ];

    const csvRows = [headers.join(',')];

    this.auditLogs.forEach((log) => {
      const row = [
        log.userId,
        log.userRole,
        log.action,
        log.subject,
        log.resourceId || '',
        log.companyId || '',
        log.postId || '',
        log.timestamp.toISOString(),
        log.success.toString(),
        log.ipAddress || '',
        log.userAgent || '',
      ];

      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }
}
