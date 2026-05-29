import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class WorkOrdersIntegrationCorsMiddleware implements NestMiddleware {
  private readonly allowAnyOrigin =
    (process.env.INTEGRATION_CORS_ALLOW_ALL ?? 'true').toLowerCase() === 'true';

  private readonly allowedOrigins = (process.env.INTEGRATION_CORS_ALLOWED_ORIGINS ??
    '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  use(request: Request, response: Response, next: NextFunction) {
    const requestOrigin = request.headers.origin;
    const resolvedOrigin = this.resolveAllowedOrigin(requestOrigin);

    if (resolvedOrigin) {
      response.header('Access-Control-Allow-Origin', resolvedOrigin);
      response.header('Vary', 'Origin');
    }

    response.header('Access-Control-Allow-Methods', 'GET,OPTIONS');
    response.header(
      'Access-Control-Allow-Headers',
      'Authorization,Content-Type,X-Shared-Token',
    );
    response.header(
      'Access-Control-Expose-Headers',
      'X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset,Retry-After',
    );
    response.header('Access-Control-Max-Age', '600');

    if (request.method === 'OPTIONS') {
      response.status(204).send();
      return;
    }

    next();
  }

  private resolveAllowedOrigin(origin?: string): string | null {
    if (!origin) {
      return this.allowAnyOrigin ? '*' : null;
    }

    if (this.allowAnyOrigin) {
      return '*';
    }

    return this.allowedOrigins.includes(origin) ? origin : null;
  }
}
