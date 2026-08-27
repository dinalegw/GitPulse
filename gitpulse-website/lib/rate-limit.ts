// Rate limiting for playground API using Vercel KV (Upstash Redis)

import { kv } from '@vercel/kv';

const RATE_LIMIT_PER_MINUTE = parseInt(process.env.RATE_LIMIT_PER_MINUTE || '5', 10);
const RATE_LIMIT_PER_HOUR = parseInt(process.env.RATE_LIMIT_PER_HOUR || '20', 10);

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
}

/**
 * Check and increment rate limit for an IP
 */
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const now = Date.now();
  const minuteKey = `ratelimit:${ip}:${Math.floor(now / 60000)}`;
  const hourKey = `ratelimit:${ip}:${Math.floor(now / 3600000)}`;

  try {
    // Use pipeline for atomic operations
    const pipeline = kv.pipeline();
    pipeline.incr(minuteKey);
    pipeline.incr(hourKey);
    pipeline.expire(minuteKey, 60);
    pipeline.expire(hourKey, 3600);
    const results = await pipeline.exec();

    const minuteCount = results[0] as number;
    const hourCount = results[1] as number;

    const minuteAllowed = minuteCount <= RATE_LIMIT_PER_MINUTE;
    const hourAllowed = hourCount <= RATE_LIMIT_PER_HOUR;

    const allowed = minuteAllowed && hourAllowed;
    const remaining = Math.min(
      RATE_LIMIT_PER_MINUTE - minuteCount,
      RATE_LIMIT_PER_HOUR - hourCount
    );

    const minuteReset = (Math.floor(now / 60000) + 1) * 60000;
    const hourReset = (Math.floor(now / 3600000) + 1) * 3600000;
    const resetTime = Math.min(minuteReset, hourReset);

    return {
      allowed,
      remaining: Math.max(0, remaining),
      resetTime,
      limit: RATE_LIMIT_PER_MINUTE,
    };
  } catch (error) {
    // If KV is not available, allow the request (fail open)
    console.warn('[RateLimit] KV unavailable, allowing request:', error);
    return {
      allowed: true,
      remaining: RATE_LIMIT_PER_MINUTE,
      resetTime: now + 60000,
      limit: RATE_LIMIT_PER_MINUTE,
    };
  }
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
  };
}