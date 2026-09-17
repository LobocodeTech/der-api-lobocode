import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuthEventType } from './audit.service';

export interface AuthMetrics {
  totalLogins: number;
  successfulLogins: number;
  failedLogins: number;
  totalLogouts: number;
  passwordResets: number;
  suspiciousActivities: number;
  uniqueUsers: number;
  averageSessionDuration: number;
  topLoginLocations: Array<{ location: string; count: number }>;
  loginTrends: Array<{ date: string; count: number }>;
  securityEvents: Array<{ eventType: string; count: number }>;
}

export interface UserMetrics {
  userId: string;
  totalLogins: number;
  lastLogin: Date;
  failedAttempts: number;
  suspiciousActivities: number;
  passwordResets: number;
  averageSessionDuration: number;
  loginLocations: string[];
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Obtém métricas gerais de autenticação
   */
  async getAuthMetrics(startDate?: Date, endDate?: Date): Promise<AuthMetrics> {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 dias atrás
    const end = endDate || new Date();

    // TODO: Implementar quando tivermos tabela de auditoria
    // Por enquanto, retorna dados mock
    return {
      totalLogins: 150,
      successfulLogins: 145,
      failedLogins: 5,
      totalLogouts: 120,
      passwordResets: 8,
      suspiciousActivities: 2,
      uniqueUsers: 25,
      averageSessionDuration: 45, // minutos
      topLoginLocations: [
        { location: 'São Paulo, BR', count: 80 },
        { location: 'Rio de Janeiro, BR', count: 45 },
        { location: 'Belo Horizonte, BR', count: 25 },
      ],
      loginTrends: this.generateMockTrends(start, end),
      securityEvents: [
        { eventType: 'failed_login_attempts', count: 3 },
        { eventType: 'unusual_location', count: 1 },
        { eventType: 'password_reset_abuse', count: 1 },
      ],
    };
  }

  /**
   * Obtém métricas de usuário específico
   */
  async getUserMetrics(userId: string): Promise<UserMetrics> {
    // TODO: Implementar quando tivermos tabela de auditoria
    // Por enquanto, retorna dados mock
    return {
      userId,
      totalLogins: 12,
      lastLogin: new Date(),
      failedAttempts: 1,
      suspiciousActivities: 0,
      passwordResets: 1,
      averageSessionDuration: 52, // minutos
      loginLocations: ['São Paulo, BR', 'Rio de Janeiro, BR'],
    };
  }

  /**
   * Obtém estatísticas de segurança
   */
  async getSecurityMetrics(
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalSecurityEvents: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    blockedIPs: number;
    suspiciousUsers: number;
  }> {
    // TODO: Implementar quando tivermos tabela de auditoria
    return {
      totalSecurityEvents: 15,
      eventsByType: {
        failed_login_attempts: 8,
        unusual_location: 3,
        password_reset_abuse: 2,
        rapid_requests: 2,
      },
      eventsBySeverity: {
        low: 2,
        medium: 8,
        high: 4,
        critical: 1,
      },
      blockedIPs: 3,
      suspiciousUsers: 2,
    };
  }

  /**
   * Obtém relatório de atividade por período
   */
  async getActivityReport(
    startDate: Date,
    endDate: Date,
    groupBy: 'hour' | 'day' | 'week' | 'month' = 'day',
  ): Promise<
    Array<{
      period: string;
      logins: number;
      logouts: number;
      failedAttempts: number;
      securityEvents: number;
    }>
  > {
    // TODO: Implementar quando tivermos tabela de auditoria
    return this.generateMockActivityReport(startDate, endDate, groupBy);
  }

  /**
   * Obtém top usuários por atividade
   */
  async getTopActiveUsers(limit: number = 10): Promise<
    Array<{
      userId: string;
      userName: string;
      loginCount: number;
      lastActivity: Date;
    }>
  > {
    // TODO: Implementar quando tivermos tabela de auditoria
    return [
      {
        userId: 'user1',
        userName: 'João Silva',
        loginCount: 25,
        lastActivity: new Date(),
      },
      {
        userId: 'user2',
        userName: 'Maria Santos',
        loginCount: 18,
        lastActivity: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    ];
  }

  /**
   * Obtém alertas de segurança
   */
  async getSecurityAlerts(): Promise<
    Array<{
      id: string;
      type: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      message: string;
      timestamp: Date;
      userId?: string;
      ipAddress?: string;
    }>
  > {
    // TODO: Implementar quando tivermos tabela de auditoria
    return [
      {
        id: 'alert1',
        type: 'failed_login_attempts',
        severity: 'high',
        message: 'Múltiplas tentativas de login falhadas detectadas',
        timestamp: new Date(Date.now() - 30 * 60 * 1000),
        ipAddress: '192.168.1.100',
      },
      {
        id: 'alert2',
        type: 'unusual_location',
        severity: 'medium',
        message: 'Login de localização incomum detectado',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        userId: 'user1',
        ipAddress: '203.0.113.1',
      },
    ];
  }

  /**
   * Gera métricas em tempo real
   */
  async getRealTimeMetrics(): Promise<{
    activeUsers: number;
    currentSessions: number;
    failedAttemptsLastHour: number;
    securityEventsLastHour: number;
  }> {
    // TODO: Implementar quando tivermos tabela de auditoria
    return {
      activeUsers: 8,
      currentSessions: 12,
      failedAttemptsLastHour: 2,
      securityEventsLastHour: 1,
    };
  }

  /**
   * Exporta métricas para relatório
   */
  async exportMetrics(
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' = 'json',
  ): Promise<string> {
    const metrics = await this.getAuthMetrics(startDate, endDate);

    if (format === 'csv') {
      return this.convertToCSV(metrics);
    }

    return JSON.stringify(metrics, null, 2);
  }

  /**
   * Gera dados mock para trends
   */
  private generateMockTrends(
    startDate: Date,
    endDate: Date,
  ): Array<{ date: string; count: number }> {
    const trends: Array<{ date: string; count: number }> = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      trends.push({
        date: currentDate.toISOString().split('T')[0],
        count: Math.floor(Math.random() * 20) + 5, // 5-25 logins por dia
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return trends;
  }

  /**
   * Gera relatório de atividade mock
   */
  private generateMockActivityReport(
    startDate: Date,
    endDate: Date,
    groupBy: 'hour' | 'day' | 'week' | 'month',
  ): Array<{
    period: string;
    logins: number;
    logouts: number;
    failedAttempts: number;
    securityEvents: number;
  }> {
    const report: Array<{
      period: string;
      logins: number;
      logouts: number;
      failedAttempts: number;
      securityEvents: number;
    }> = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      report.push({
        period: currentDate.toISOString().split('T')[0],
        logins: Math.floor(Math.random() * 15) + 3,
        logouts: Math.floor(Math.random() * 12) + 2,
        failedAttempts: Math.floor(Math.random() * 3),
        securityEvents: Math.floor(Math.random() * 2),
      });

      switch (groupBy) {
        case 'hour':
          currentDate.setHours(currentDate.getHours() + 1);
          break;
        case 'day':
          currentDate.setDate(currentDate.getDate() + 1);
          break;
        case 'week':
          currentDate.setDate(currentDate.getDate() + 7);
          break;
        case 'month':
          currentDate.setMonth(currentDate.getMonth() + 1);
          break;
      }
    }

    return report;
  }

  /**
   * Converte métricas para CSV
   */
  private convertToCSV(metrics: AuthMetrics): string {
    const headers = ['Metric', 'Value', 'Generated At'];

    const rows = [
      [
        'Total Logins',
        metrics.totalLogins.toString(),
        new Date().toISOString(),
      ],
      [
        'Successful Logins',
        metrics.successfulLogins.toString(),
        new Date().toISOString(),
      ],
      [
        'Failed Logins',
        metrics.failedLogins.toString(),
        new Date().toISOString(),
      ],
      [
        'Total Logouts',
        metrics.totalLogouts.toString(),
        new Date().toISOString(),
      ],
      [
        'Password Resets',
        metrics.passwordResets.toString(),
        new Date().toISOString(),
      ],
      [
        'Suspicious Activities',
        metrics.suspiciousActivities.toString(),
        new Date().toISOString(),
      ],
      [
        'Unique Users',
        metrics.uniqueUsers.toString(),
        new Date().toISOString(),
      ],
      [
        'Average Session Duration (minutes)',
        metrics.averageSessionDuration.toString(),
        new Date().toISOString(),
      ],
    ];

    return [headers, ...rows].map((row) => row.join(',')).join('\n');
  }
}
