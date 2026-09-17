import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import {
  AUTH_MESSAGES,
  AUTH_CONSTANTS,
  PASSWORD_RESET_RATE_LIMIT,
} from '../constants';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const PASSWORD_RESET_ENDPOINTS = new Set([
  'POST:/auth/forgot-password',
  'POST:/auth/forgot-password/validate-token',
  'POST:/auth/forgot-password/reset',
]);

@Injectable()
export class RateLimitGuard implements CanActivate {
  private rateLimitStore = new Map<string, RateLimitEntry>();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    const clientId = this.getClientId(request);
    const endpoint = this.getEndpoint(request);

    const config = this.getRateLimitConfig(endpoint);

    if (!config) {
      return true;
    }

    const emailKey = this.getEmailKey(request, endpoint);
    const key = emailKey
      ? `${clientId}:${emailKey}:${endpoint}`
      : `${clientId}:${endpoint}`;
    const now = Date.now();

    this.cleanupExpiredEntries();

    const entry = this.rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      this.rateLimitStore.set(key, {
        count: 1,
        resetTime: now + config.windowMs,
      });
      return true;
    }

    if (entry.count >= config.maxAttempts) {
      throw new HttpException(
        AUTH_MESSAGES.ERROR.TOO_MANY_ATTEMPTS,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count++;
    return true;
  }

  private getClientId(request: Request): string {
    const ip =
      request.ip ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      'unknown';

    return ip.toString();
  }

  private getEndpoint(request: Request): string {
    return `${request.method}:${request.path}`;
  }

  private getEmailKey(request: Request, endpoint: string): string | null {
    if (!PASSWORD_RESET_ENDPOINTS.has(endpoint)) {
      return null;
    }

    const body = request.body as { email?: string } | undefined;
    const email = body?.email?.trim().toLowerCase();
    return email || 'no-email';
  }

  private getRateLimitConfig(endpoint: string) {
    if (PASSWORD_RESET_ENDPOINTS.has(endpoint)) {
      return {
        maxAttempts: PASSWORD_RESET_RATE_LIMIT.MAX_ATTEMPTS,
        windowMs: PASSWORD_RESET_RATE_LIMIT.WINDOW_MS,
      };
    }

    const configs: Record<string, { maxAttempts: number; windowMs: number }> = {
      'POST:/auth/login': {
        maxAttempts: AUTH_CONSTANTS.RATE_LIMIT.LOGIN_MAX_ATTEMPTS,
        windowMs: AUTH_CONSTANTS.RATE_LIMIT.LOGIN_WINDOW_MS,
      },
      'POST:/auth/refresh': {
        maxAttempts: AUTH_CONSTANTS.RATE_LIMIT.REFRESH_MAX_ATTEMPTS,
        windowMs: AUTH_CONSTANTS.RATE_LIMIT.REFRESH_WINDOW_MS,
      },
    };

    return configs[endpoint];
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();

    this.rateLimitStore.forEach((entry, key) => {
      if (now > entry.resetTime) {
        this.rateLimitStore.delete(key);
      }
    });
  }

  resetClient(clientId: string): void {
    this.rateLimitStore.forEach((_, key) => {
      if (key.startsWith(clientId)) {
        this.rateLimitStore.delete(key);
      }
    });
  }
}
