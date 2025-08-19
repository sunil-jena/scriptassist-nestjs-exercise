/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';

type Primitive = string | number | boolean | null | undefined;
type JSONObject = { [k: string]: any };

const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
]);
const SENSITIVE_FIELD_PATTERNS = [
  /password/i,
  /pass(i)?/i,
  /^pwd$/i,
  /secret/i,
  /token/i,
  /bearer/i,
  /session/i,
  /api[-_]?key/i,
  /client[-_]?secret/i,
  /refresh[_-]?token/i,
  /access[_-]?token/i,
];
const MAX_PREVIEW_CHARS = 1024;
const MAX_BODY_LOG_BYTES = 64 * 1024;
const SKIP_PATHS = [/^\/health(?:\/|$)/i, /^\/metrics$/i];
const SKIP_METHODS = new Set(['OPTIONS']);

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function shouldRedactKey(key: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some(re => re.test(key));
}
function redactValue(val: any): any {
  if (val == null) return val;
  if (typeof val === 'string') return '[REDACTED]';
  if (typeof val === 'number' || typeof val === 'boolean') return '[REDACTED]';
  if (Array.isArray(val)) return val.map(() => '[REDACTED]');
  if (isObject(val)) {
    const out: JSONObject = {};
    for (const k of Object.keys(val)) out[k] = '[REDACTED]';
    return out;
  }
  return '[REDACTED]';
}
function deepRedact(obj: any): any {
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map(deepRedact);
  if (!isObject(obj)) return obj;
  const out: JSONObject = {};
  for (const [k, v] of Object.entries(obj)) {
    if (shouldRedactKey(k)) out[k] = redactValue(v);
    else if (Array.isArray(v)) out[k] = v.map(deepRedact);
    else if (isObject(v)) out[k] = deepRedact(v);
    else out[k] = v;
  }
  return out;
}
function sanitizeHeaders(headers: Record<string, Primitive>): Record<string, Primitive> {
  const out: Record<string, Primitive> = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    out[k] = SENSITIVE_HEADER_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : v;
  }
  return out;
}
function safeBodyPreview(req: any): any {
  const ctype = String(req.headers?.['content-type'] ?? '').toLowerCase();
  if (ctype.includes('multipart/form-data') || ctype.includes('octet-stream')) {
    return '[BINARY_OR_MULTIPART_BODY_OMITTED]';
  }
  const body = req.body;
  if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) return undefined;
  try {
    const redacted = deepRedact(body);
    const json = JSON.stringify(redacted);
    if (Buffer.byteLength(json) > MAX_BODY_LOG_BYTES) return '[BODY_TOO_LARGE_OMITTED]';
    return redacted;
  } catch {
    return '[BODY_UNSERIALIZABLE]';
  }
}
function isTextLikeContentType(ct?: string) {
  if (!ct) return false;
  const c = ct.toLowerCase();
  return c.includes('application/json') || c.startsWith('text/');
}
function safeResponsePreview(data: any, res: any): string {
  try {
    const ct = String(res.getHeader?.('content-type') ?? '');
    if (!isTextLikeContentType(ct)) return '[NON_TEXT_RESPONSE_OMITTED]';
    if (data == null) return '';
    const redacted = deepRedact(data);
    const s = typeof redacted === 'string' ? redacted : JSON.stringify(redacted);
    return s.length > MAX_PREVIEW_CHARS ? s.slice(0, MAX_PREVIEW_CHARS) + '…' : s;
  } catch {
    return '[RESPONSE_UNSERIALIZABLE]';
  }
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<any>();
    const res = http.getResponse<any>();

    const url = (req.originalUrl || req.url || '') as string;
    if (SKIP_METHODS.has(req.method) || SKIP_PATHS.some(rx => rx.test(url))) {
      return next.handle();
    }

    const controller = context.getClass().name;
    const handler = context.getHandler().name;

    const existingId = req.headers['x-request-id'] || req.headers['x-correlation-id'] || req.id;
    const correlationId = (typeof existingId === 'string' ? existingId : undefined) || randomUUID();
    (req as any).correlationId = correlationId;
    try {
      res.setHeader('x-request-id', correlationId);
    } catch (err) {
      (res as any).locals = (res as any).locals || {};
      (res as any).locals.requestId = correlationId;
      this.logger.warn(
        JSON.stringify({
          msg: 'set-header-failed',
          header: 'x-request-id',
          id: correlationId,
          reason: 'headers_already_sent_or_immutable',
          method: req.method,
          url,
          ts: new Date().toISOString(),
        }),
      );
    }

    const method = req.method;
    const ip =
      req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    const ua = req.headers['user-agent'];
    const userId = req.user?.sub || req.user?.id;

    const sanitizedHeaders = sanitizeHeaders(req.headers || {});
    const sanitizedQuery = deepRedact(req.query || {});
    const sanitizedBody = safeBodyPreview(req);

    const startHr = process.hrtime.bigint();
    const routePath = (req.route?.path as string) || url;

    this.logger.log(
      JSON.stringify({
        msg: 'request',
        id: correlationId,
        method,
        path: routePath,
        url,
        controller,
        handler,
        ip,
        ua,
        userId: userId ?? null,
        headers: sanitizedHeaders,
        query: sanitizedQuery,
        body: sanitizedBody,
        ts: new Date().toISOString(),
      }),
    );

    return next.handle().pipe(
      tap({
        next: (data: any) => {
          const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
          const status = res.statusCode;

          const contentLenHeader = res.getHeader?.('content-length');
          let responseSize =
            typeof contentLenHeader === 'string'
              ? Number(contentLenHeader)
              : Array.isArray(contentLenHeader)
                ? Number(contentLenHeader[0])
                : undefined;

          if (responseSize === undefined) {
            try {
              const s = typeof data === 'string' ? data : JSON.stringify(data);
              responseSize = Buffer.byteLength(s);
            } catch {
              responseSize = undefined;
            }
          }

          const preview = safeResponsePreview(data, res);

          const payload = {
            msg: 'response',
            id: correlationId,
            method,
            path: routePath,
            url,
            controller,
            handler,
            status,
            durationMs: Math.round(durationMs),
            responseSize,
            preview,
            ts: new Date().toISOString(),
          };

          if (status >= 500) this.logger.error(JSON.stringify(payload));
          else if (status >= 400) this.logger.warn(JSON.stringify(payload));
          else this.logger.log(JSON.stringify(payload));
        },
        error: (err: any) => {
          const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
          const status =
            (typeof err?.status === 'number' && err.status) ||
            (typeof err?.statusCode === 'number' && err.statusCode) ||
            500;

          const message =
            (err?.response && err.response.message) || err?.message || 'Internal error';

          this.logger.error(
            JSON.stringify({
              msg: 'error',
              id: correlationId,
              method,
              path: routePath,
              url,
              controller,
              handler,
              status,
              durationMs: Math.round(durationMs),
              error: { name: err?.name, message },
              ts: new Date().toISOString(),
            }),
          );
        },
      }),
    );
  }
}
