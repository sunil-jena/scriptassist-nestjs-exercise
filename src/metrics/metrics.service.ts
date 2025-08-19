import { Injectable } from '@nestjs/common';
import { Registry, collectDefaultMetrics, Histogram, Counter } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  readonly httpDuration: Histogram<string>;
  readonly httpRequests: Counter<string>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });

    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status'] as const,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });

    this.httpRequests = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'] as const,
      registers: [this.registry],
    });
  }

  getRegistry(): Registry {
    return this.registry;
  }
}
