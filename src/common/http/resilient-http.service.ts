/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig } from 'axios';
import { catchError, firstValueFrom, timeout, throwError } from 'rxjs';

/**
 * Import opossum in a way that works with both CJS and ESM builds.
 * In some builds, `require('opossum')` returns the constructor directly.
 * In others, it returns { default: Constructor }.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const OpossumModule: any = require('opossum');
const CircuitBreaker: any = OpossumModule?.default ?? OpossumModule;

@Injectable()
export class ResilientHttpService {
  private readonly breaker: any;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(private readonly http: HttpService) {
    this.timeoutMs = Number(process.env.HTTP_CLIENT_TIMEOUT_MS ?? 5000);
    this.retries = Number(process.env.HTTP_CLIENT_RETRIES ?? 2);

    if (typeof CircuitBreaker !== 'function') {
      throw new Error(
        'Failed to load opossum CircuitBreaker constructor. ' +
          'Check that "opossum" is installed and not tree-shaken, or enable esModuleInterop.',
      );
    }

    this.breaker = new CircuitBreaker((config: AxiosRequestConfig) => this.fire(config), {
      timeout: this.timeoutMs + 1000,
      errorThresholdPercentage: Number(process.env.CB_ERROR_THRESHOLD_PCT ?? 50),
      resetTimeout: Number(process.env.CB_RESET_TIMEOUT_MS ?? 10000),
    });
  }

  private async fire(config: AxiosRequestConfig): Promise<any> {
    let attempt = 0;
    let lastErr: any;

    while (attempt <= this.retries) {
      try {
        const obs = this.http.request(config).pipe(
          timeout(this.timeoutMs),
          catchError(err => throwError(() => err)),
        );
        const resp = await firstValueFrom(obs);
        return resp.data;
      } catch (err) {
        lastErr = err;
        attempt += 1;
        if (attempt > this.retries) break;
      }
    }
    throw lastErr;
  }

  async request(config: AxiosRequestConfig) {
    return this.breaker.fire(config);
  }
}
