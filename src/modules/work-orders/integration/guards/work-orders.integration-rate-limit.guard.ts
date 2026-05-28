import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';

type RateLimitEntry = {
  count: number;
  resetTime: number;
};

@Injectable()
export class WorkOrdersIntegrationRateLimitGuard implements CanActivate {
  private readonly store = new Map<string, RateLimitEntry>();
  private readonly maxRequests = this.toPositiveInt(
    process.env.INTEGRATION_RATE_LIMIT_MAX,
    120,
  );
  private readonly windowMs = this.toPositiveInt(
    process.env.INTEGRATION_RATE_LIMIT_WINDOW_MS,
    60_000,
  );

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    if (request.method === 'OPTIONS') {
      return true;
    }

    this.cleanupExpiredEntries();

    const now = Date.now();
    const clientId = this.getClientId(request);
    const key = `${request.method}:${request.path}:${clientId}`;

    const current = this.store.get(key);
    const entry =
      !current || now > current.resetTime
        ? { count: 0, resetTime: now + this.windowMs }
        : current;

    entry.count += 1;
    this.store.set(key, entry);

    const remaining = Math.max(this.maxRequests - entry.count, 0);
    response.setHeader('X-RateLimit-Limit', String(this.maxRequests));
    response.setHeader('X-RateLimit-Remaining', String(remaining));
    response.setHeader(
      'X-RateLimit-Reset',
      String(Math.ceil(entry.resetTime / 1000)),
    );

    if (entry.count > this.maxRequests) {
      response.setHeader(
        'Retry-After',
        String(Math.ceil((entry.resetTime - now) / 1000)),
      );
      throw new HttpException(
        'Muitas requisições para o endpoint de integração. Tente novamente em instantes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getClientId(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    const headerIp =
      typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0]?.trim()
        : Array.isArray(forwardedFor)
          ? forwardedFor[0]
          : undefined;

    return (
      headerIp ||
      request.ip ||
      request.socket?.remoteAddress ||
      request.connection?.remoteAddress ||
      'unknown'
    );
  }

  private cleanupExpiredEntries() {
    const now = Date.now();
    this.store.forEach((value, key) => {
      if (now > value.resetTime) {
        this.store.delete(key);
      }
    });
  }

  private toPositiveInt(rawValue: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(String(rawValue ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
