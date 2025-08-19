/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RequestContextService } from '../request-context/request-context.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly rctx: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Internal server error';
    let errorName = 'Error';

    if (isHttp) {
      const r = exception.getResponse() as any;
      message = (r && (r.message || r.error)) || (exception as any).message || message;
      errorName = (exception as any).name || 'Error';
    } else if (exception && typeof exception === 'object') {
      errorName = (exception as any).name || 'Error';
      message = (exception as any).message || message;
    }

    const requestId = this.rctx.get('requestId');
    const userId = this.rctx.get('userId');

    this.logger.error(
      JSON.stringify({
        msg: 'unhandled_exception',
        status,
        name: errorName,
        message,
        method: req.method,
        url: req.originalUrl || req.url,
        userId: userId ?? null,
        requestId,
        ts: new Date().toISOString(),
      }),
    );

    res.status(status).json({
      statusCode: status,
      error: errorName,
      message,
      requestId,
      path: req.originalUrl || req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
