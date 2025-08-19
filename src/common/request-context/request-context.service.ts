/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

type Ctx = { requestId?: string; userId?: string; [k: string]: any };

@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<Ctx>();

  run<T>(seed: Ctx, fn: () => T): T {
    return this.als.run(seed, fn);
  }

  get<T = any>(key: keyof Ctx): T | undefined {
    return this.als.getStore()?.[key] as T | undefined;
  }

  set(key: keyof Ctx, value: any) {
    const store = this.als.getStore();
    if (store) store[key] = value;
  }

  snapshot(): Ctx | undefined {
    const store = this.als.getStore();
    return store ? { ...store } : undefined;
  }
}
