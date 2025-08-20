/* eslint-disable @typescript-eslint/no-unused-vars */
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

import { UsersModule } from './modules/users/users.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AuthModule } from './modules/auth/auth.module';

import { TaskProcessorModule } from './queues/task-processor/task-processor.module';
import { ScheduledTasksModule } from './queues/scheduled-tasks/scheduled-tasks.module';

// Resilience & Observability
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { ResilientHttpModule } from './common/http/resilient-http.module';
import { RequestContextService } from './common/request-context/request-context.service';
import { RequestContextMiddleware } from './common/request-context/request-context.middleware';

// (Optional) legacy cache service if used elsewhere
import { CacheService } from './common/services/cache.service';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';
import { HttpExceptionFilter } from '@common/filters/http-exception.filter';
import { APP_FILTER } from '@nestjs/core';

@Module({
  imports: [
    // -------- Config --------
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // -------- Database (TypeORM) --------
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: Number(config.get<number>('DB_PORT')),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_DATABASE'),
        autoLoadEntities: true, // auto-load entities from feature modules
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: config.get('NODE_ENV') === 'development', // never enable in prod
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),

    // -------- Scheduling --------
    ScheduleModule.forRoot(),

    // -------- Queue (BullMQ / Redis) --------
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL');
        const host = config.get<string>('REDIS_HOST') ?? '127.0.0.1';
        const port = Number(config.get<number>('REDIS_PORT') ?? 6379);
        const password = config.get<string>('REDIS_PASSWORD');

        return {
          connection: url
            ? { url }
            : {
                host,
                port,
                ...(password ? { password } : {}),
              },
          // sensible defaults; tune as needed
          defaultJobOptions: {
            removeOnComplete: 1000,
            removeOnFail: 1000,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          },
        };
      },
    }),

    // -------- Rate limiting (controller-level via guard/decorator) --------
    // NOTE: Throttler v5 supports array style; if you use older versions, convert accordingly.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => [
        {
          ttl: 60_000,
          limit: 100,
        },
      ],
    }),

    // -------- Resilience & Observability --------
    HealthModule,
    MetricsModule,
    ResilientHttpModule,
    // -------- Feature modules --------
    UsersModule,
    TasksModule,
    AuthModule,

    // -------- Queue processing modules --------
    TaskProcessorModule,
    ScheduledTasksModule,
  ],
  providers: [
    // Request context for per-request correlation/user id
    RequestContextService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useFactory: (rctx: RequestContextService) => new AllExceptionsFilter(rctx),
      inject: [RequestContextService],
    },
    // If other parts of the app still depend on this, keep it.
    // Prefer replacing with a distributed cache (e.g., cache-manager + Redis) later.
    CacheService,
  ],
  // Avoid exporting infra unless truly needed elsewhere
  exports: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Attach correlation id & user id to ALS for every request
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
