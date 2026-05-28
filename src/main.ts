import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { CustomLoggerService } from './shared/common/logger/logger.service';
import { MetricsInterceptor } from './shared/common/interceptors/metrics.interceptor';
import { IoAdapter } from '@nestjs/platform-socket.io';
// import { runSeed } from 'prisma/seed';
import session from 'express-session';

async function bootstrap() {
  try {
    // runSeed();

    const app = await NestFactory.create(AppModule, {
      // Importante: Habilitar CORS na criação do app para WebSockets
      cors: true,
    });
    const logger = app.get(CustomLoggerService);
    const isProduction = process.env.NODE_ENV === 'production';

    // Necessário para respeitar x-forwarded-proto/host atrás de proxy (Traefik/Nginx)
    app.getHttpAdapter().getInstance().set('trust proxy', 1);

    // CRITICAL: Configurar WebSocket adapter ANTES de qualquer outra coisa
    app.useWebSocketAdapter(new IoAdapter(app));

    // Sessão necessária para Passport OAuth (armazena state entre redirect e callback)
    app.use(
      session({
        secret: process.env.JWT_SECRET ?? 'oauth-session-secret',
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: isProduction,
          sameSite: 'lax',
          maxAge: 10 * 60 * 1000,
        }, // 10 min - apenas para OAuth flow
      }),
    );

    const corsAllowAll = (process.env.CORS_ALLOW_ALL ?? 'true').toLowerCase() === 'true';
    const allowedOrigins = [
      'https://api.departamento-estadual-rodovias.com.br',
      'https://api.departamento-estadual-rodovias.com',
      'https://der-api.lobocode.com.br',
      'https://der-app.lobocode.com.br',
      'http://31.97.166.94', // Nginx proxy
      'https://31.97.166.94',
      'http://localhost:4200',
      'http://localhost:5174',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3111',
      'http://127.0.0.1:3111',
    ];

    // Configurar CORS detalhado para HTTP
    app.enableCors({
      origin: (origin, callback) => {
        // Chamadas server-to-server ou ferramentas locais sem Origin.
        if (!origin) return callback(null, true);
        if (corsAllowAll) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origem não permitida por CORS'));
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Origin',
        'Accept',
        'X-Requested-With',
        'X-Shared-Token',
      ],
      credentials: true,
      preflightContinue: false,
      optionsSuccessStatus: 204,
    });

    app.useGlobalPipes(
      new ValidationPipe({
        errorHttpStatusCode: 422,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
        whitelist: true,
        forbidNonWhitelisted: true,
        disableErrorMessages: false,
      }),
    );

    app.useGlobalInterceptors(new MetricsInterceptor());

    const port = process.env.PORT ?? 3011;
    await app.listen(port);

    logger.log(`🚀 Aplicação iniciada na porta ${port}`, 'Bootstrap');
    logger.log(
      `🔌 WebSocket habilitado em ws://localhost:${port}`,
      'Bootstrap',
    );
    logger.log(
      `📡 Gateway de notificações: ws://localhost:${port}`,
      'Bootstrap',
    );
    logger.log(
      `📊 Health check disponível em http://localhost:${port}/health`,
      'Bootstrap',
      
    );
    logger.log(
      `📈 Métricas disponíveis em http://localhost:${port}/metrics`,
      'Bootstrap',
    );
  } catch (error) {
    console.error('❌ Erro ao iniciar aplicação:', error);
    process.exit(1);
  }
}
bootstrap();
