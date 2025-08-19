/* eslint-disable @typescript-eslint/no-explicit-any */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const method = req.method;
    const path = (req.route?.path as string) || req.originalUrl || req.url || 'unknown';
    const stopTimer = this.metrics.httpDuration.startTimer({ method, path });

    return next.handle().pipe(
      tap({
        next: () => {
          const status = String(res.statusCode);
          stopTimer({ status });
          this.metrics.httpRequests.inc({ method, path, status }, 1);
        },
        error: () => {
          const status = String(res.statusCode || 500);
          stopTimer({ status });
          this.metrics.httpRequests.inc({ method, path, status }, 1);
        },
      }),
    );
  }
}
