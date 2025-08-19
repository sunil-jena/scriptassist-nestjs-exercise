import { Injectable, Inject } from '@nestjs/common';
import {
  HealthCheckService,
  HealthIndicatorResult,
  HealthCheckResult,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Redis } from 'ioredis';
import { REDIS_HEALTH } from './tokens';

@Injectable()
export class HealthService {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    @Inject(REDIS_HEALTH) private readonly redis: Redis,
  ) {}

  async checkDb(): Promise<HealthIndicatorResult> {
    return this.db.pingCheck('database');
  }

  async checkRedis(): Promise<HealthIndicatorResult> {
    const start = Date.now();
    const pong = await this.redis.ping();
    const latency = Date.now() - start;
    return {
      redis: {
        status: pong === 'PONG' ? 'up' : 'down',
        latencyMs: latency,
      },
    };
  }

  async liveness(): Promise<HealthCheckResult> {
    return this.health.check([async () => ({ liveness: { status: 'up' } })]);
  }

  async readiness(): Promise<HealthCheckResult> {
    return this.health.check([() => this.checkDb(), () => this.checkRedis()]);
  }
}
