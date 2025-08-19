/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { RequestContextService } from './request-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly rctx: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const existing =
      (req.headers['x-request-id'] as string) || (req.headers['x-correlation-id'] as string);
    const requestId = existing || randomUUID();

    const userId = (req as any).user?.sub || (req as any).user?.id || undefined;

    this.rctx.run({ requestId, userId }, () => {
      try {
        res.setHeader('x-request-id', requestId);
      } catch {
        (res as any).locals = (res as any).locals || {};
        (res as any).locals.requestId = requestId;
      }
      next();
    });
  }
}
