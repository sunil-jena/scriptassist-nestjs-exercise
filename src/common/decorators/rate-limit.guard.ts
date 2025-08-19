import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';
import IORedis, { Redis } from 'ioredis';

const LUA_SLIDING_WINDOW = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit  = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)

if count >= limit then
  local ttl = redis.call('PTTL', key)
  if ttl < 0 then ttl = window end
  return {0, count, ttl}
end

redis.call('ZADD', key, now, tostring(now) .. '-' .. math.random())
redis.call('PEXPIRE', key, window)
local ttl = redis.call('PTTL', key)
if ttl < 0 then ttl = window end
return {1, count + 1, ttl}
`;

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly redis: Redis;

  constructor(private readonly reflector: Reflector) {
    this.redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!opts) return true;

    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();

    const windowMs = Math.max(1, opts.windowMs);
    const limit = Math.max(1, opts.limit);
    const setHeaders = opts.setHeaders ?? true;

    const controller = ctx.getClass().name;
    const handler = ctx.getHandler().name;
    const routeKey = `${controller}.${handler}`;
    const prefix = opts.keyPrefix ?? 'rl';

    const ip = (req.ip ??
      req.headers['x-forwarded-for'] ??
      req.connection?.remoteAddress ??
      'unknown') as string;

    const userId = req.user?.sub as string | undefined;
    const byUser = opts.byUser ?? Boolean(userId);
    const byIp = opts.byIp ?? true;

    const parts = [prefix, routeKey];
    if (byUser && userId) parts.push(`u:${userId}`);
    if (byIp) parts.push(`ip:${ip}`);
    const key = parts.join(':');

    const now = Date.now();
    const [allowed, count, pttl] = (await this.redis.eval(
      LUA_SLIDING_WINDOW,
      1,
      key,
      now,
      windowMs,
      limit,
    )) as [number, number, number];

    const remaining = Math.max(0, limit - count);
    const resetSeconds = Math.ceil(pttl / 1000);

    if (setHeaders) {
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.floor(now / 1000) + resetSeconds));
      if (!allowed) res.setHeader('Retry-After', String(resetSeconds));
    }

    if (allowed === 1) return true;

    throw new HttpException('Rate limit exceeded. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
  }
}
