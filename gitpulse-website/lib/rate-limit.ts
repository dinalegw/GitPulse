// Playground rate limiting.
// Vercel KV provides distributed counters when configured. Without KV,
// an in-memory fallback still limits bursts per warm server instance so
// the playground remains usable without making optional storage mandatory.

import { kv } from '@vercel/kv';
import { withOptionalStorageTimeout } from './optional-storage';

function positiveInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const RATE_LIMIT_PER_MINUTE = positiveInteger(
  process.env.RATE_LIMIT_PER_MINUTE,
  5
);
const RATE_LIMIT_PER_HOUR = positiveInteger(
  process.env.RATE_LIMIT_PER_HOUR,
  20
);

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
}

interface MemoryCounter {
  count: number;
  expiresAt: number;
}

type MemoryRateStore = Map<string, MemoryCounter>;
const memory: MemoryRateStore =
  (globalThis as { __gitpulseRateLimit?: MemoryRateStore })
    .__gitpulseRateLimit ?? new Map();

if (!(globalThis as { __gitpulseRateLimit?: MemoryRateStore }).__gitpulseRateLimit) {
  (globalThis as { __gitpulseRateLimit?: MemoryRateStore }).__gitpulseRateLimit =
    memory;
}

function kvAvailable(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function incrementMemory(key: string, expiresAt: number, now: number): number {
  const existing = memory.get(key);
  if (!existing || existing.expiresAt <= now) {
    memory.set(key, { count: 1, expiresAt });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

function inMemoryRateLimit(ip: string, now: number): RateLimitResult {
  const minuteReset = (Math.floor(now / 60_000) + 1) * 60_000;
  const hourReset = (Math.floor(now / 3_600_000) + 1) * 3_600_000;
  const minuteKey = `minute:${ip}:${Math.floor(now / 60_000)}`;
  const hourKey = `hour:${ip}:${Math.floor(now / 3_600_000)}`;

  const minuteCount = incrementMemory(minuteKey, minuteReset, now);
  const hourCount = incrementMemory(hourKey, hourReset, now);

  // Opportunistically remove stale keys to keep a warm instance bounded.
  if (memory.size > 2_000) {
    for (const [key, value] of memory) {
      if (value.expiresAt <= now) memory.delete(key);
    }
  }

  return {
    allowed:
      minuteCount <= RATE_LIMIT_PER_MINUTE &&
      hourCount <= RATE_LIMIT_PER_HOUR,
    remaining: Math.max(
      0,
      Math.min(
        RATE_LIMIT_PER_MINUTE - minuteCount,
        RATE_LIMIT_PER_HOUR - hourCount
      )
    ),
    resetTime: Math.min(minuteReset, hourReset),
    limit: RATE_LIMIT_PER_MINUTE,
  };
}

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const now = Date.now();

  if (!kvAvailable()) {
    return inMemoryRateLimit(ip, now);
  }

  const minuteKey = `ratelimit:${ip}:${Math.floor(now / 60_000)}`;
  const hourKey = `ratelimit:${ip}:${Math.floor(now / 3_600_000)}`;

  try {
    const pipeline = kv.pipeline();
    pipeline.incr(minuteKey);
    pipeline.incr(hourKey);
    pipeline.expire(minuteKey, 60);
    pipeline.expire(hourKey, 3_600);
    const results = await withOptionalStorageTimeout(
      pipeline.exec(),
      'rate-limit pipeline'
    );

    const minuteCount = results[0] as number;
    const hourCount = results[1] as number;
    const minuteReset = (Math.floor(now / 60_000) + 1) * 60_000;
    const hourReset = (Math.floor(now / 3_600_000) + 1) * 3_600_000;

    return {
      allowed:
        minuteCount <= RATE_LIMIT_PER_MINUTE &&
        hourCount <= RATE_LIMIT_PER_HOUR,
      remaining: Math.max(
        0,
        Math.min(
          RATE_LIMIT_PER_MINUTE - minuteCount,
          RATE_LIMIT_PER_HOUR - hourCount
        )
      ),
      resetTime: Math.min(minuteReset, hourReset),
      limit: RATE_LIMIT_PER_MINUTE,
    };
  } catch (error) {
    console.warn('[RateLimit] KV unavailable; using in-memory limiter:', error);
    return inMemoryRateLimit(ip, now);
  }
}

export function getRateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
  };
}
