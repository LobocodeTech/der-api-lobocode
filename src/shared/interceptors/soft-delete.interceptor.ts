import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SoftDeleteInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;

    // Intercepta apenas operações DELETE
    if (method === 'DELETE') {
      return next.handle().pipe(
        tap(async (result) => {
          // Extrai o ID do recurso da URL
          const resourceId = this.extractResourceId(url);
          const resourceType = this.extractResourceType(url);

          if (resourceId && resourceType) {
            await this.performSoftDelete(resourceType, resourceId);
          }
        }),
      );
    }

    return next.handle();
  }

  private extractResourceId(url: string): string | null {
    // Extrai ID da URL (ex: /users/123 -> 123)
    const match = url.match(/\/([^/]+)\/([a-zA-Z0-9-]+)$/);
    return match ? match[2] : null;
  }

  private extractResourceType(url: string): string | null {
    // Extrai tipo do recurso da URL (ex: /users/123 -> users)
    const match = url.match(/\/([^/]+)\/([a-zA-Z0-9-]+)$/);
    return match ? match[1] : null;
  }

  private async performSoftDelete(
    resourceType: string,
    resourceId: string,
  ): Promise<void> {
    try {
      const modelName = this.getModelName(resourceType);

      if (modelName) {
        await this.prisma[modelName].update({
          where: { id: resourceId },
          data: { deletedAt: new Date() },
        });
      }
    } catch (error) {
      // Log do erro mas não falha a operação
      console.error(
        `Soft delete failed for ${resourceType}/${resourceId}:`,
        error,
      );
    }
  }

  private getModelName(resourceType: string): string | null {
    // Mapeia URLs para nomes de modelos do Prisma
    const modelMap: { [key: string]: string } = {
      users: 'user',
      companies: 'company',
      posts: 'post',
      products: 'product',
    };

    return modelMap[resourceType] || null;
  }
}
