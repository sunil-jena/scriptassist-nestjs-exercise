/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, TimeoutError, catchError, throwError, timeout } from 'rxjs';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly ms = Number(process.env.HTTP_TIMEOUT_MS ?? 10000)) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(this.ms),
      catchError(err => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException());
        }
        return throwError(() => err);
      }),
    );
  }
}
