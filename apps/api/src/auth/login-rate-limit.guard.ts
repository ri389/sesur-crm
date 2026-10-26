import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from './auth.types';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

/** Défense applicative locale ; le proxy de production doit aussi limiter /api/auth/login. */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly limit = 10;
  private readonly windowMs = 60_000;
  private readonly maxTrackedIps = 10_000;
  private readonly buckets = new Map<string, RateLimitBucket>();

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let bucket = this.buckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(ip, bucket);
    }

    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    response.setHeader('RateLimit-Limit', String(this.limit));
    response.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count >= this.limit) {
      response.setHeader('RateLimit-Remaining', '0');
      response.setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        'Trop de tentatives de connexion. Réessayez plus tard.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
    response.setHeader('RateLimit-Remaining', String(this.limit - bucket.count));
    this.pruneExpired(now);
    return true;
  }

  private pruneExpired(now: number): void {
    if (this.buckets.size <= this.maxTrackedIps) return;

    for (const [ip, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(ip);
      if (this.buckets.size <= this.maxTrackedIps) break;
    }

    while (this.buckets.size > this.maxTrackedIps) {
      const oldestIp = this.buckets.keys().next().value;
      if (!oldestIp) break;
      this.buckets.delete(oldestIp);
    }
  }
}
