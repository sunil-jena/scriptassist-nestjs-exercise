/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

type Primitive = string | number | boolean | null | undefined;

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string; user?: any }>();

    const status = exception.getStatus?.() ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception.getResponse?.();

    // ---- correlation id ----------------------------------------------------
    const requestIdHeader = Array.isArray(request.headers['x-request-id'])
      ? request.headers['x-request-id'][0]
      : request.headers['x-request-id'];
    const requestId = request.id || requestIdHeader || undefined;

    // ---- normalize error payload -------------------------------------------
    const { code, message, details } = this.normalizeHttpError(
      status,
      exception.message,
      exceptionResponse,
    );

    // ---- log with severity & context ---------------------------------------
    const logCtx = {
      requestId,
      status,
      method: request.method,
      path: request.originalUrl || request.url,
      userId: request.user?.id,
      // keep logs useful but safe
      details: this.sanitize(details),
    };

    if (status >= 500) {
      this.logger.error(
        `HTTP ${status} ${code}: ${message}`,
        (exception as any)?.stack,
        JSON.stringify(logCtx),
      );
    } else {
      this.logger.warn(`HTTP ${status} ${code}: ${message} ${JSON.stringify(logCtx)}`);
    }

    // ---- consistent, safe response body ------------------------------------
    const body = {
      success: false,
      statusCode: status,
      error: {
        code,
        message,
        // only include details if present (e.g., validation messages)
        ...(details ? { details: this.sanitize(details) } : {}),
      },
      path: request.originalUrl || request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      ...(requestId ? { requestId } : {}),
    };

    response.status(status).json(body);
  }

  private normalizeHttpError(
    status: number,
    fallbackMessage: string,
    raw: unknown,
  ): { code: string; message: string; details?: unknown } {
    const defaultCode = this.statusCodeToName(status);

    // getResponse() can be: string | { statusCode, message, error, ... }
    if (typeof raw === 'string') {
      return {
        code: defaultCode,
        message: raw || fallbackMessage || defaultCode,
      };
    }

    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;

      // Common Nest/ValidationPipe shape:
      // { statusCode: 400, message: string | string[], error: 'Bad Request' }
      const errLabel = (obj['error'] as string) || defaultCode;

      // message can be a string OR an array of messages
      const rawMsg = obj['message'];
      let message: string = fallbackMessage || errLabel || defaultCode;
      let details: unknown;

      if (Array.isArray(rawMsg)) {
        // Validation case → keep list as details, give a generic message
        details = rawMsg;
        message = status === 400 ? 'Validation failed' : errLabel || defaultCode;
      } else if (typeof rawMsg === 'string') {
        message = rawMsg || message;
      }

      // Some libraries attach `errors` (object map of field → messages)
      if (!details && obj['errors']) {
        details = obj['errors'];
      }

      return {
        code: errLabel || defaultCode,
        message: message || defaultCode,
        ...(details ? { details } : {}),
      };
    }

    // Fallback
    return {
      code: defaultCode,
      message: fallbackMessage || defaultCode,
    };
  }

  /**
   * Convert numeric HTTP status to a stable enum-like code string.
   * e.g., 400 -> 'BAD_REQUEST', 404 -> 'NOT_FOUND'
   */
  private statusCodeToName(status: number): string {
    const name = (HttpStatus as any)[status] as string | undefined;
    return name ? String(name) : `HTTP_${status}`;
  }

  /**
   * Recursively remove sensitive values from logged/returned details.
   */
  private sanitize<T>(value: T): T {
    const SENSITIVE = /password|token|secret|authorization|cookie|api[-_]?key|set-cookie/i;

    const redact = (v: unknown): unknown => {
      if (v === null || v === undefined) return v;
      if (typeof v === 'string') return v;
      if (typeof v === 'number' || typeof v === 'boolean') return v;

      if (Array.isArray(v)) return v.map(redact);

      if (typeof v === 'object') {
        const obj = v as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(obj)) {
          out[k] = SENSITIVE.test(k) ? '[REDACTED]' : redact(val);
        }
        return out;
      }
      return v;
    };

    return redact(value) as T;
  }
}
