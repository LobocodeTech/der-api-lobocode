import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class SoftDeleteFilterMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Adiciona filtro para excluir registros deletados em consultas
    if (req.method === 'GET' && !req.query.includeDeleted) {
      // Adiciona filtro para excluir registros com deletedAt
      req.query.deletedAt = 'null';
    }

    next();
  }
}
