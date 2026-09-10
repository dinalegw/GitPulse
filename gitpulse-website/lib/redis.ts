import { Redis } from '@upstash/redis';

type RedisGlobal = typeof globalThis & {
  __gitpulseRedis?: Redis;
};

export function redisConfigured(): boolean {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim();
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim();
  return Boolean(url && token);
}

export function getRedis(): Redis | null {
  if (!redisConfigured()) return null;

  const shared = globalThis as RedisGlobal;
  if (!shared.__gitpulseRedis) {
    shared.__gitpulseRedis = Redis.fromEnv();
  }
  return shared.__gitpulseRedis;
}
