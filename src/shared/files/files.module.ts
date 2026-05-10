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
    consumer.apply(MinioPublicObjectMiddleware).forRoutes(FilesController);
  }
}
