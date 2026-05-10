import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { FilesService } from '../services/files.service';

/**
 * URLs públicas salvas como https://APP_HOST/files/<bucket>/<objectKey...>.
 * O Nest não possui rota catch-all para vários segmentos; sem este middleware
 * o GET cai no 404. Roda antes do AuthGuard — leitura pública alinhada à policy do bucket.
 */
@Injectable()
export class MinioPublicObjectMiddleware implements NestMiddleware {
  constructor(private readonly filesService: FilesService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }

    const url = req.originalUrl.split('?')[0];
    if (!url.startsWith('/files/')) {
      next();
      return;
    }

    const rest = url.slice('/files/'.length);
    const bucket = this.filesService.getBucketName();
    const prefix = `${bucket}/`;

    if (!rest.startsWith(prefix)) {
      next();
      return;
    }

    const objectKey = rest.slice(prefix.length);
    if (!objectKey || objectKey.includes('..')) {
      next();
      return;
    }

    void this.filesService
      .tryStreamObjectToResponse(objectKey, req, res)
      .then((handled) => {
        if (!handled) {
          next();
        }
      })
      .catch(() => next());
  }
}
