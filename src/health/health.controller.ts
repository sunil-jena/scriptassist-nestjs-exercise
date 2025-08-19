import { Controller, Get } from '@nestjs/common';
import { HealthCheck } from '@nestjs/terminus';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly svc: HealthService) {}

  @Get('live')
  @HealthCheck()
  live() {
    return this.svc.liveness();
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.svc.readiness();
  }
}
