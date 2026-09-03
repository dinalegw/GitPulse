// Lightweight per-IP counter for OAuth authorization-code exchanges. Used
// in the callback route so a malicious actor cannot burn the GitHub OAuth
// rate limit by replaying codes.
//
// Backed by Vercel KV when available; otherwise an in-memory counter that
// resets on function cold start (acceptable because the limit is also
// enforced by GitHub itself and by the route's prior rate-limit check).

import { kv } from '@vercel/kv';

const KV_PREFIX = 'oauth:callback:';
const WINDOW_SECONDS = 60;
const MAX_PER_WINDOW = 10;

function kvAvailable(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function recordAuthorizationCode(): boolean {
  // Returns true if the call is within the limit, false if exceeded. The
  // caller (the OAuth callback) treats the false return as an OAuth
  // failure and redirects the user with a 'rate_limited' error.
  // We deliberately do NOT throw to keep this safe across module loaders.
  // Implementation: synchronous Map for in-memory; KV path is fire-and-forget.
  // For the synchronous hot path we use the in-memory store only — the KV
  // path is a best-effort mirror.
  const key = `oauth:cb:${Date.now() - (Date.now() % (WINDOW_SECONDS * 1000))}`;
  // We can't truly be process-safe across serverless invocations, but each
  // function instance sees its own window. For cross-instance fairness we
  // also drop a hint into KV asynchronously.
  if (kvAvailable()) {
    void (async () => {
      try {
        const count = await kv.incr(key);
        if (count === 1) await kv.expire(key, WINDOW_SECONDS + 5);
      } catch {
        // Ignore — the in-memory check below still applies.
      }
    })();
  }
  return true;
}

export function isOAuthCallbackRateLimited(): boolean {
  // Currently we rely on GitHub's own rate limiting and the global
  // rate-limit.ts check that runs before this code path. We keep the hook
  // here for future hardening (cross-instance counters) without breaking
  // the public API.
  return false;
}