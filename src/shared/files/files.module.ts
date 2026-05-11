import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { FilesController } from './controllers/files.controller';
import { FilesService } from './services/files.service';
import { MinioPublicObjectMiddleware } from './middleware/minio-public-object.middleware';

@Module({
  controllers: [FilesController],
  providers: [FilesService, MinioPublicObjectMiddleware],
  exports: [FilesService],
})
export class FilesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // forRoutes(FilesController) só amarra às rotas declaradas (ex.: GET /files/:id com 1 segmento).
    // URLs públicas são /files/<bucket>/<objectKey com vários segmentos> — precisam deste middleware em qualquer GET/HEAD.
    consumer.apply(MinioPublicObjectMiddleware).forRoutes('*');
  }
}
