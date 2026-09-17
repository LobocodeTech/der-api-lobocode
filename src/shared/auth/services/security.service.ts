import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from './audit.service';
import { Request } from 'express';

export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  threshold: number;
  timeWindow: number; // em minutos
  action: 'log' | 'block' | 'notify';
}

export interface SecurityEvent {
  userId?: string;
  ipAddress: string;
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, any>;
  timestamp: Date;
}

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private readonly securityRules: SecurityRule[] = [
    {
      id: 'failed_login_attempts',
      name: 'Tentativas de Login Falhadas',
      description: 'Detecta múltiplas tentativas de login falhadas',
      enabled: true,
      threshold: 5,
      timeWindow: 15,
      action: 'block',
    },
    {
      id: 'unusual_location',
      name: 'Localização Incomum',
      description: 'Detecta login de localização diferente do padrão',
      enabled: true,
      threshold: 1,
      timeWindow: 60,
      action: 'notify',
    },
    {
      id: 'rapid_requests',
      name: 'Requisições Rápidas',
      description: 'Detecta muitas requisições em pouco tempo',
      enabled: true,
      threshold: 100,
      timeWindow: 1,
      action: 'block',
    },
    {
      id: 'password_reset_abuse',
      name: 'Abuso de Reset de Senha',
      description: 'Detecta múltiplos resets de senha',
      enabled: true,
      threshold: 3,
      timeWindow: 60,
      action: 'notify',
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Analisa atividade de login
   */
  async analyzeLoginActivity(
    userId: string,
    request: Request,
    success: boolean,
  ): Promise<SecurityEvent[]> {
    const events: SecurityEvent[] = [];
    const ipAddress = this.getClientIp(request);

    // Verificar tentativas falhadas
    if (!success) {
      const failedAttempts = await this.getFailedLoginAttempts(ipAddress, 15);

      if (failedAttempts >= 5) {
        events.push({
          userId,
          ipAddress,
          eventType: 'failed_login_attempts',
          severity: 'high',
          details: { failedAttempts, timeWindow: '15min' },
          timestamp: new Date(),
        });
      }
    }

    // Verificar localização incomum
    if (success) {
      const isUnusualLocation = await this.checkUnusualLocation(
        userId,
        ipAddress,
      );

      if (isUnusualLocation) {
        events.push({
          userId,
          ipAddress,
          eventType: 'unusual_location',
          severity: 'medium',
          details: { location: await this.getLocationFromIp(ipAddress) },
          timestamp: new Date(),
        });
      }
    }

    return events;
  }

  /**
   * Analisa atividade de reset de senha
   */
  async analyzePasswordResetActivity(
    userId: string,
    request: Request,
  ): Promise<SecurityEvent[]> {
    const events: SecurityEvent[] = [];
    const ipAddress = this.getClientIp(request);

    // Verificar abuso de reset de senha
    const resetAttempts = await this.getPasswordResetAttempts(userId, 60);

    if (resetAttempts >= 3) {
      events.push({
        userId,
        ipAddress,
        eventType: 'password_reset_abuse',
        severity: 'medium',
        details: { resetAttempts, timeWindow: '7d' },
        timestamp: new Date(),
      });
    }

    return events;
  }

  /**
   * Analisa requisições rápidas
   */
  async analyzeRequestRate(
    ipAddress: string,
    endpoint: string,
  ): Promise<SecurityEvent[]> {
    const events: SecurityEvent[] = [];

    // Verificar rate limiting
    const requestCount = await this.getRequestCount(ipAddress, endpoint, 1);

    if (requestCount >= 100) {
      events.push({
        ipAddress,
        eventType: 'rapid_requests',
        severity: 'high',
        details: { requestCount, endpoint, timeWindow: '1min' },
        timestamp: new Date(),
      });
    }

    return events;
  }

  /**
   * Processa eventos de segurança
   */
  async processSecurityEvents(
    events: SecurityEvent[],
    request: Request,
  ): Promise<void> {
    for (const event of events) {
      // Log do evento
      await this.auditService.logSuspiciousActivity(
        event.userId || 'anonymous',
        request,
        event.eventType,
        event.details,
      );

      // Aplicar ações baseadas na severidade
      await this.applySecurityAction(event);
    }
  }

  /**
   * Aplica ação de segurança
   */
  private async applySecurityAction(event: SecurityEvent): Promise<void> {
    const rule = this.securityRules.find((r) => r.id === event.eventType);

    if (!rule || !rule.enabled) {
      return;
    }

    switch (rule.action) {
      case 'log':
        this.logger.warn(`🔒 Security Event: ${event.eventType}`, event);
        break;

      case 'block':
        this.logger.error(`🚫 Security Block: ${event.eventType}`, event);
        // TODO: Implementar bloqueio de IP
        break;

      case 'notify':
        this.logger.warn(`📢 Security Alert: ${event.eventType}`, event);
        // TODO: Implementar notificação (email, Slack, etc.)
        break;
    }
  }

  /**
   * Obtém tentativas de login falhadas
   */
  private async getFailedLoginAttempts(
    ipAddress: string,
    minutes: number,
  ): Promise<number> {
    // TODO: Implementar quando tivermos tabela de auditoria
    // Por enquanto, retorna mock
    return Math.floor(Math.random() * 3); // 0-2 tentativas
  }

  /**
   * Verifica localização incomum
   */
  private async checkUnusualLocation(
    userId: string,
    ipAddress: string,
  ): Promise<boolean> {
    // TODO: Implementar verificação de localização
    // Por enquanto, retorna false (não é incomum)
    return false;
  }

  /**
   * Obtém tentativas de reset de senha
   */
  private async getPasswordResetAttempts(
    userId: string,
    minutes: number,
  ): Promise<number> {
    // TODO: Implementar quando tivermos tabela de auditoria
    // Por enquanto, retorna mock
    return Math.floor(Math.random() * 2); // 0-1 tentativas
  }

  /**
   * Obtém contagem de requisições
   */
  private async getRequestCount(
    ipAddress: string,
    endpoint: string,
    minutes: number,
  ): Promise<number> {
    // TODO: Implementar rate limiting real
    // Por enquanto, retorna mock
    return Math.floor(Math.random() * 50); // 0-49 requisições
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
  private async getLocationFromIp(ip: string): Promise<string> {
    // TODO: Integrar com serviço de geolocalização
    if (ip === 'unknown' || ip === '127.0.0.1') {
      return 'localhost';
    }
    return 'São Paulo, BR';
  }

  /**
   * Obtém regras de segurança
   */
  getSecurityRules(): SecurityRule[] {
    return this.securityRules;
  }

  /**
   * Atualiza regra de segurança
   */
  updateSecurityRule(ruleId: string, updates: Partial<SecurityRule>): void {
    const ruleIndex = this.securityRules.findIndex((r) => r.id === ruleId);
    if (ruleIndex !== -1) {
      this.securityRules[ruleIndex] = {
        ...this.securityRules[ruleIndex],
        ...updates,
      };
    }
  }
}
