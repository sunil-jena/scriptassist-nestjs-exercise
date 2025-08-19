import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { ConfigModule, ConfigService } from '@nestjs/config';
import IORedis, { Redis } from 'ioredis';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { REDIS_HEALTH } from './tokens';

@Module({
  // Import Terminus for health indicators and Config for env-driven Redis
  imports: [TerminusModule, ConfigModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    {
      provide: REDIS_HEALTH,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): Redis => {
        const url = cfg.get<string>('REDIS_URL');
        const host = cfg.get<string>('REDIS_HOST') ?? '127.0.0.1';
        const port = Number(cfg.get<number>('REDIS_PORT') ?? 6379);
        const password = cfg.get<string>('REDIS_PASSWORD');

        return url
          ? new IORedis(url, { maxRetriesPerRequest: 1, enableReadyCheck: true })
          : new IORedis({
              host,
              port,
              password,
              maxRetriesPerRequest: 1,
              enableReadyCheck: true,
            });
      },
    },
  ],
})
export class HealthModule {}
