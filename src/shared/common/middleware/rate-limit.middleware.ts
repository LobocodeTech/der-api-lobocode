import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private store: RateLimitStore = {};
  
  // Configuração baseada no ambiente
  private readonly windowMs = 15 * 60 * 1000; // 15 minutos
  
  // Limites configuráveis por variável de ambiente
  private readonly maxRequests = this.getMaxRequests();

  private getMaxRequests(): number {
    // Prioridade: variável de ambiente > ambiente > padrão
    if (process.env.RATE_LIMIT_MAX_REQUESTS) {
      const parsed = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    
    return process.env.NODE_ENV === 'production' 
      ? 20000  // 20000 req/15min ≈ 1333 req/min (produção; IP compartilhado)
      : 50000; // 50000 req/15min ≈ 3333 req/min (desenvolvimento)
  }

  use(req: Request, res: Response, next: NextFunction) {
    const key = this.getClientKey(req);
    const now = Date.now();

    // Limpar registros expirados
    this.cleanup();

    // Verificar se o cliente existe no store
    if (!this.store[key]) {
      this.store[key] = {
        count: 0,
        resetTime: now + this.windowMs,
      };
    }

    // Verificar se o período foi resetado
    if (now > this.store[key].resetTime) {
      this.store[key] = {
        count: 0,
        resetTime: now + this.windowMs,
      };
    }

    // Incrementar contador
    this.store[key].count++;

    // Verificar limite
    if (this.store[key].count > this.maxRequests) {
      const remainingMinutes = Math.max(
        1,
        Math.ceil((this.store[key].resetTime - now) / 1000 / 60),
      );
      const minutesLabel =
        remainingMinutes === 1 ? '1 minuto' : `${remainingMinutes} minutos`;
      throw new HttpException(
        `Muitas requisições. Tente novamente em ${minutesLabel}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Adicionar headers de rate limit
    res.setHeader('X-RateLimit-Limit', this.maxRequests);
    res.setHeader('X-RateLimit-Remaining', this.maxRequests - this.store[key].count);
    res.setHeader('X-RateLimit-Reset', this.store[key].resetTime);

    next();
  }

  private getClientKey(req: Request): string {
    // Usar IP real se estiver atrás de proxy
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    return `rate_limit:${ip}`;
  }

  private cleanup() {
    const now = Date.now();
    Object.keys(this.store).forEach(key => {
      if (now > this.store[key].resetTime) {
        delete this.store[key];
      }
    });
  }
} 