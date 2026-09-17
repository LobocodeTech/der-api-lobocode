import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Request } from 'express';

export enum AuthEventType {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  LOGOUT_ALL = 'LOGOUT_ALL',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_VALIDATE = 'PASSWORD_RESET_VALIDATE',
  PASSWORD_RESET_COMPLETE = 'PASSWORD_RESET_COMPLETE',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  LOGIN_FAILED = 'LOGIN_FAILED',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
}

export interface AuthAuditLog {
  userId?: string;
  eventType: AuthEventType;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  details?: Record<string, any>;
  errorMessage?: string;
  location?: string;
  timestamp: Date;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra evento de autenticação
   */
  async logAuthEvent(auditLog: Omit<AuthAuditLog, 'timestamp'>): Promise<void> {
    const logData = {
      ...auditLog,
      timestamp: new Date(),
    };

    try {
      // Log estruturado para análise
      this.logStructuredEvent(logData);

      // TODO: Salvar no banco quando tivermos tabela de auditoria
      // await this.saveToDatabase(logData);
    } catch (error) {
      this.logger.error('Erro ao registrar evento de auditoria:', error);
    }
  }

  /**
   * Log de login bem-sucedido
   */
  async logLoginSuccess(
    userId: string,
    request: Request,
    details?: Record<string, any>,
  ): Promise<void> {
    await this.logAuthEvent({
      userId,
      eventType: AuthEventType.LOGIN,
      ipAddress: this.getClientIp(request),
      userAgent: request.headers['user-agent'] || 'Unknown',
      success: true,
      details,
      location: await this.getLocationFromIp(this.getClientIp(request)),
    });
  }

  /**
   * Log de login falhado
   */
  async logLoginFailed(
    email: string,
    request: Request,
    errorMessage: string,
  ): Promise<void> {
    await this.logAuthEvent({
      eventType: AuthEventType.LOGIN_FAILED,
      ipAddress: this.getClientIp(request),
      userAgent: request.headers['user-agent'] || 'Unknown',
      success: false,
      details: { email },
      errorMessage,
      location: await this.getLocationFromIp(this.getClientIp(request)),
    });
  }

  /**
   * Log de logout
   */
  async logLogout(
    userId: string,
    request: Request,
    logoutType: 'single' | 'all' = 'single',
  ): Promise<void> {
    await this.logAuthEvent({
      userId,
      eventType:
        logoutType === 'all' ? AuthEventType.LOGOUT_ALL : AuthEventType.LOGOUT,
      ipAddress: this.getClientIp(request),
      userAgent: request.headers['user-agent'] || 'Unknown',
      success: true,
      details: { logoutType },
    });
  }

  /**
   * Log de reset de senha
   */
  async logPasswordReset(
    userId: string,
    request: Request,
    eventType: 'request' | 'validate' | 'complete',
  ): Promise<void> {
    const eventTypeMap: Record<typeof eventType, AuthEventType> = {
      request: AuthEventType.PASSWORD_RESET_REQUEST,
      validate: AuthEventType.PASSWORD_RESET_VALIDATE,
      complete: AuthEventType.PASSWORD_RESET_COMPLETE,
    };

    await this.logAuthEvent({
      userId,
      eventType: eventTypeMap[eventType],
      ipAddress: this.getClientIp(request),
      userAgent: request.headers['user-agent'] || 'Unknown',
      success: true,
      details: { resetType: eventType },
    });
  }

  async logPasswordResetFailure(
    request: Request,
    eventType: 'request' | 'validate' | 'complete',
    email?: string,
  ): Promise<void> {
    await this.logAuthEvent({
      eventType: AuthEventType.PASSWORD_RESET_REQUEST,
      ipAddress: this.getClientIp(request),
      userAgent: request.headers['user-agent'] || 'Unknown',
      success: false,
      details: { resetType: eventType, emailDomain: email?.split('@')[1] },
      errorMessage: 'Password reset step failed',
    });
  }

  /**
   * Log de atividade suspeita
   */
  async logSuspiciousActivity(
    userId: string,
    request: Request,
    reason: string,
    details?: Record<string, any>,
  ): Promise<void> {
    await this.logAuthEvent({
      userId,
      eventType: AuthEventType.SUSPICIOUS_ACTIVITY,
      ipAddress: this.getClientIp(request),
      userAgent: request.headers['user-agent'] || 'Unknown',
      success: false,
      details: { reason, ...details },
      errorMessage: reason,
    });
  }

  /**
   * Log de refresh de token
   */
  async logTokenRefresh(
    userId: string,
    request: Request,
    success: boolean,
    errorMessage?: string,
  ): Promise<void> {
    await this.logAuthEvent({
      userId,
      eventType: AuthEventType.TOKEN_REFRESH,
      ipAddress: this.getClientIp(request),
      userAgent: request.headers['user-agent'] || 'Unknown',
      success,
      errorMessage,
    });
  }

  /**
   * Obtém estatísticas de autenticação
   */
  async getAuthStatistics(
    userId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalLogins: number;
    failedLogins: number;
    suspiciousActivities: number;
    passwordResets: number;
    lastLogin?: Date;
  }> {
    // TODO: Implementar quando tivermos tabela de auditoria
    // Por enquanto, retorna dados mock
    return {
      totalLogins: 0,
      failedLogins: 0,
      suspiciousActivities: 0,
      passwordResets: 0,
    };
  }

  /**
   * Log estruturado para análise
   */
  private logStructuredEvent(logData: AuthAuditLog): void {
    const logEntry = {
      timestamp: logData.timestamp.toISOString(),
      event: logData.eventType,
      userId: logData.userId || 'anonymous',
      ip: logData.ipAddress,
      userAgent: logData.userAgent,
      success: logData.success,
      location: logData.location,
      details: logData.details,
      error: logData.errorMessage,
    };

    if (logData.success) {
      this.logger.log(`🔐 Auth Event: ${logData.eventType}`, logEntry);
    } else {
      this.logger.warn(`⚠️ Auth Event: ${logData.eventType}`, logEntry);
    }
  }

  /**
   * Obtém IP do cliente
   */
  private getClientIp(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string) ||
      (request.headers['x-real-ip'] as string) ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      'unknown'
    );
  }

  /**
   * Obtém localização do IP (mock)
   */
  private async getLocationFromIp(ip: string): Promise<string | undefined> {
    // TODO: Integrar com serviço de geolocalização (MaxMind, IP2Location, etc.)
    if (ip === 'unknown' || ip === '127.0.0.1') {
      return 'localhost';
    }

    // Mock para desenvolvimento
    return 'São Paulo, BR';
  }

  /**
   * Salva no banco de dados (futuro)
   */
  private async saveToDatabase(logData: AuthAuditLog): Promise<void> {
    // TODO: Implementar quando tivermos tabela de auditoria
    // await this.prisma.authAuditLog.create({
    //   data: {
    //     userId: logData.userId,
    //     eventType: logData.eventType,
    //     ipAddress: logData.ipAddress,
    //     userAgent: logData.userAgent,
    //     success: logData.success,
    //     details: logData.details,
    //     errorMessage: logData.errorMessage,
    //     location: logData.location,
    //     timestamp: logData.timestamp,
    //   },
    // });
  }
}
