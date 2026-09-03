// Server-side session store. Holds AuthSession keyed by session id.
//
// Production: Vercel KV (Upstash Redis). Tokens are NEVER stored — only the
// identity summary returned by GitHub is persisted. The bearer token lives
// in memory only for the duration of a single API call.
//
// Local dev: a Map fallback is used when KV env vars are missing. The
// fallback never writes to disk and is rebuilt on every function cold
// start. It is intentionally not persistent so it cannot leak data.

import { kv } from '@vercel/kv';
import type { AuthSession } from './github-oauth';

const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

const KV_PREFIX = 'auth:session:';

const memoryStore: Map<string, AuthSession> = (globalThis as { __gitpulseSessionStore?: Map<string, AuthSession> })
  .__gitpulseSessionStore ?? new Map<string, AuthSession>();

if (!(globalThis as { __gitpulseSessionStore?: Map<string, AuthSession> }).__gitpulseSessionStore) {
  (globalThis as { __gitpulseSessionStore?: Map<string, AuthSession> }).__gitpulseSessionStore = memoryStore;
}

function kvAvailable(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function saveSession(session: AuthSession): Promise<void> {
  // Strip the bearer token — only identity, scopes, and installation list are
  // persisted. Re-acquire the token per request from the OAuth provider if
  // a privileged GitHub API call is ever needed (it is not today: the
  // hosted platform will use GitHub App installation tokens issued server
  // side for backend automation, not user OAuth tokens).
  const persisted: AuthSession = { ...session };

  if (kvAvailable()) {
    try {
      await kv.set(`${KV_PREFIX}${persisted.sessionId}`, JSON.stringify(persisted), {
        ex: SESSION_TTL_SECONDS,
      });
      return;
    } catch (error) {
      console.warn('[auth] KV write failed, falling back to memory store:', error);
    }
  }
  memoryStore.set(persisted.sessionId, persisted);
}

export async function loadSession(sessionId: string): Promise<AuthSession | null> {
  if (kvAvailable()) {
    try {
      const raw = await kv.get<string>(`${KV_PREFIX}${sessionId}`);
      if (raw) {
        return JSON.parse(raw) as AuthSession;
      }
      return null;
    } catch (error) {
      console.warn('[auth] KV read failed, falling back to memory store:', error);
    }
  }
  const fromMemory = memoryStore.get(sessionId);
  if (!fromMemory) return null;
  if (fromMemory.expiresAt < Date.now()) {
    memoryStore.delete(sessionId);
    return null;
  }
  return fromMemory;
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (kvAvailable()) {
    try {
      await kv.del(`${KV_PREFIX}${sessionId}`);
      return;
    } catch (error) {
      console.warn('[auth] KV delete failed, falling back to memory store:', error);
    }
  }
  memoryStore.delete(sessionId);
}