import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import * as Minio from 'minio';

export interface FileInfo {
  id: string;
  originalName: string;
  fileName: string;
  type: string;
  size: number;
  mimeType: string;
  url: string;
  companyId: string | null;
  uploadedBy: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly minioClient: Minio.Client;
  private readonly bucketName: string;
  private readonly publicMinioBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.bucketName =
      this.configService.get<string>('MINIO_BUCKET_NAME') ??
      'departamento-estadual-rodovias-files';
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const legacyEndpoint = this.configService.get<string>('MINIO_ENDPOINT');
    const internalEndpoint =
      this.configService.get<string>('MINIO_INTERNAL_ENDPOINT') ?? legacyEndpoint;

    let endpointHost: string | undefined;
    let endpointPort: number | undefined;
    let endpointUseSSL: boolean | undefined;
    if (internalEndpoint) {
      try {
        const endpointUrl = new URL(internalEndpoint);
        endpointHost = endpointUrl.hostname || undefined;
        endpointPort = endpointUrl.port
          ? Number.parseInt(endpointUrl.port, 10)
          : undefined;
        endpointUseSSL = endpointUrl.protocol === 'https:';
      } catch {
        // Endpoint inválido: segue para os fallbacks do ambiente.
      }
    }

    const endpointLooksPublic =
      endpointHost !== undefined &&
      endpointHost !== 'localhost' &&
      endpointHost !== '127.0.0.1' &&
      endpointHost !== 'minio';

    const minioHost =
      this.configService.get<string>('MINIO_HOST') ??
      (isProduction && endpointLooksPublic ? undefined : endpointHost) ??
      (isProduction ? 'minio' : 'localhost');

    const minioPortRaw = this.configService.get<string>('MINIO_PORT');
    const minioPort =
      (minioPortRaw ? Number.parseInt(minioPortRaw, 10) : undefined) ??
      (isProduction && endpointLooksPublic ? undefined : endpointPort) ??
      (isProduction ? 9000 : 3311);

    const useSSLRaw = this.configService.get<string>('MINIO_USE_SSL');
    const useSSL =
      useSSLRaw !== undefined
        ? useSSLRaw.toLowerCase() === 'true'
        : ((isProduction && endpointLooksPublic ? undefined : endpointUseSSL) ??
          false);

    this.minioClient = new Minio.Client({
      endPoint: minioHost,
      port: minioPort,
      useSSL: useSSL,
      accessKey: this.configService.get<string>('MINIO_ROOT_USER', 'admin'),
      secretKey: this.configService.get<string>(
        'MINIO_ROOT_PASSWORD',
        'password123',
      ),
    });

    this.publicMinioBaseUrl = this.resolvePublicMinioBaseUrl(isProduction);
    this.initializeBucket();
  }

  getBucketName(): string {
    return this.bucketName;
  }

  /** GET/HEAD público: path-style /files/<bucket>/<objectKey> → objeto no MinIO. */
  async tryStreamObjectToResponse(
    objectKey: string,
    req: Request,
    res: Response,
  ): Promise<boolean> {
    try {
      const stat = await this.minioClient.statObject(this.bucketName, objectKey);
      const meta = stat.metaData ?? {};
      const contentType =
        (meta['content-type'] as string | undefined) ||
        (meta['Content-Type'] as string | undefined) ||
        'application/octet-stream';

      if (req.method === 'HEAD') {
        res.setHeader('Content-Type', contentType);
        if (stat.size !== undefined) {
          res.setHeader('Content-Length', String(stat.size));
        }
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.end();
        return true;
      }

      const stream = await this.minioClient.getObject(this.bucketName, objectKey);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      stream.on('error', (err) => {
        this.logger.warn(`Stream MinIO ${objectKey}: ${err instanceof Error ? err.message : err}`);
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
      stream.pipe(res);
      return true;
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: string }).code)
          : '';
      if (code === 'NotFound' || code === 'NoSuchKey') {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Arquivo não encontrado no armazenamento',
        });
        return true;
      }
      this.logger.warn(
        `stat/get MinIO ${objectKey}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return false;
    }
  }

  private resolvePublicMinioBaseUrl(isProduction: boolean): string {
    const configuredPublicEndpoint = this.configService.get<string>(
      'MINIO_PUBLIC_ENDPOINT',
    );
    const internalEndpoint =
      this.configService.get<string>('MINIO_INTERNAL_ENDPOINT') ??
      this.configService.get<string>('MINIO_ENDPOINT');

    const isLocalUrl = (url?: string): boolean => {
      if (!url) {
        return false;
      }
      return url.includes('://localhost') || url.includes('://127.0.0.1');
    };

    if (isProduction) {
      if (configuredPublicEndpoint && !isLocalUrl(configuredPublicEndpoint)) {
        return configuredPublicEndpoint;
      }

      const appHost = this.configService.get<string>('APP_HOST');
      if (appHost) {
        return `https://${appHost}/files`;
      }

      return configuredPublicEndpoint ?? internalEndpoint ?? 'http://localhost:3311';
    }

    if (configuredPublicEndpoint && isLocalUrl(configuredPublicEndpoint)) {
      return configuredPublicEndpoint;
    }
    if (isLocalUrl(internalEndpoint)) {
      return internalEndpoint!;
    }

    const minioHost = this.configService.get<string>('MINIO_HOST') ?? 'localhost';
    const minioPort = this.configService.get<string>('MINIO_PORT') ?? '3311';
    return `http://${minioHost}:${minioPort}`;
  }

  private async initializeBucket(): Promise<void> {
    try {
      const bucketExists = await this.minioClient.bucketExists(this.bucketName);
      if (!bucketExists) {
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        this.logger.log(`Bucket '${this.bucketName}' criado com sucesso`);
      }

      // Configurar política de acesso público para leitura
      const publicReadPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${this.bucketName}/*`],
          },
        ],
      };

      await this.minioClient.setBucketPolicy(
        this.bucketName,
        JSON.stringify(publicReadPolicy),
      );
      this.logger.log(
        `Política de acesso público configurada para bucket '${this.bucketName}'`,
      );
    } catch (error) {
      this.logger.error(`Erro ao inicializar bucket: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async uploadFile(
    file: any,
    type: string,
    companyId?: string,
    uploadedBy?: string,
    description?: string,
  ): Promise<FileInfo> {
    try {
      // Gerar nome único para o arquivo
      const fileName = `${Date.now()}-${file.originalname}`;
      const folder = companyId ? `companies/${companyId}` : 'public';
      const fullPath = `${folder}/${fileName}`;

      // Upload para MinIO
      await this.minioClient.putObject(
        this.bucketName,
        fullPath,
        file.buffer,
        file.size,
        { 'Content-Type': file.mimetype },
      );

      // URL pública
      const url = `${this.publicMinioBaseUrl}/${this.bucketName}/${fullPath}`;

      // Salvar no banco
      const fileRecord = await this.prisma.file.create({
        data: {
          originalName: file.originalname,
          fileName: fullPath,
          type: type as any,
          size: file.size,
          mimeType: file.mimetype,
          url,
          companyId,
          uploadedBy,
          description,
        },
      });

      this.logger.log(`Arquivo enviado com sucesso: ${fileRecord.id}`);
      return fileRecord;
    } catch (error) {
      this.logger.error(`Erro ao fazer upload: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error(`Falha no upload: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getAllFiles(
    page = 1,
    limit = 20,
    companyId?: string,
  ): Promise<{ files: FileInfo[]; total: number }> {
    try {
      const skip = (page - 1) * limit;
      const where = companyId ? { companyId } : {};

      const [files, total] = await Promise.all([
        this.prisma.file.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.file.count({ where }),
      ]);

      return { files, total };
    } catch (error) {
      this.logger.error(`Erro ao buscar arquivos: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async getFileById(id: string): Promise<FileInfo> {
    try {
      const file = await this.prisma.file.findUnique({
        where: { id },
      });

      if (!file) {
        throw new Error('Arquivo não encontrado');
      }

      return file;
    } catch (error) {
      this.logger.error(`Erro ao buscar arquivo: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async deleteFile(id: string): Promise<void> {
    try {
      const file = await this.prisma.file.findUnique({
        where: { id },
      });

      if (!file) {
        throw new Error('Arquivo não encontrado');
      }

      // Deletar do MinIO
      await this.minioClient.removeObject(this.bucketName, file.fileName);

      // Deletar do banco
      await this.prisma.file.delete({
        where: { id },
      });

      this.logger.log(`Arquivo deletado: ${id}`);
    } catch (error) {
      this.logger.error(`Erro ao deletar arquivo: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
}
