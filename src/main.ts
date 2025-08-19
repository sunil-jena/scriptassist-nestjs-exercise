/* eslint-disable @typescript-eslint/no-explicit-any */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

// --- Added imports ---
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { RequestContextService } from './common/request-context/request-context.service';
import { HttpExceptionFilter } from '@common/filters/http-exception.filter';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Trust reverse proxies
  (app.getHttpAdapter().getInstance() as any)?.set?.('trust proxy', true);

  // Security headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Parse cookies
  app.use(cookieParser());

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new LoggingInterceptor());

  // --- Added: Prometheus metrics + per-request timeout ---
  app.useGlobalInterceptors(app.get(MetricsInterceptor), new TimeoutInterceptor());

  // --- Added: Global exception filter with contextual request id ---
  app.useGlobalFilters(
    new HttpExceptionFilter(),
    new AllExceptionsFilter(app.get(RequestContextService)),
  );

  const corsOriginEnv = process.env.CORS_ORIGIN?.split(',')
    .map(s => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOriginEnv && corsOriginEnv.length > 0 ? corsOriginEnv : true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  });

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('TaskFlow API')
    .setDescription('Task Management System API')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'access-token',
    )
    .addCookieAuth('refresh_token', {
      type: 'apiKey',
      in: 'cookie',
    })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document, {
    jsonDocumentUrl: 'api-json',
    swaggerOptions: {
      displayRequestDuration: true,
    },
  });

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  console.log(`Application running on: http://localhost:${port}`);
  console.log(`Swagger documentation: http://localhost:${port}/api`);

  // --- Added: basic process-level safety nets (optional) ---
  process.on('unhandledRejection', (reason: any) => {
    // keep minimal to avoid noise; LoggingInterceptor covers request-scoped errors
    console.error(
      JSON.stringify({
        msg: 'unhandled_rejection',
        reason: reason?.message ?? String(reason),
        ts: new Date().toISOString(),
      }),
    );
  });
  process.on('uncaughtException', (err: any) => {
    console.error(
      JSON.stringify({
        msg: 'uncaught_exception',
        error: { name: err?.name, message: err?.message },
        ts: new Date().toISOString(),
      }),
    );
  });
}
bootstrap();
