// Audit log for privileged platform actions.
//
// Goals:
//   - Record who did what, when, with which scopes.
//   - NEVER include secrets, bearer tokens, OAuth codes, or raw cookie
//     values. Every event is filtered through a redaction layer before
//     persistence.
//   - Be safe to call from request handlers; failures must never break
//     the user-visible flow.
//
// Storage:
//   - Production: Vercel KV (Upstash Redis), append-only list keyed by day.
//     TTL: 90 days, matching the data-retention policy documented in
//     docs/privacy.md.
//   - Local dev: in-memory ring buffer (lost on restart). This is
//     intentional so we never write audit data to the developer's disk.

import { kv } from '@vercel/kv';

const KV_PREFIX = 'audit:event:';
const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
const MAX_EVENT_LENGTH = 4096;

export type AuditEventInput = {
  type: string;
  actorUserId?: number;
  actorLogin?: string;
  scopes?: string[];
  installationCount?: number;
  error?: string;
  message?: string;
  sessionIdPresent?: boolean;
  ip?: string;
  userAgent?: string;
  runId?: string;
  command?: string;
  runsCleaned?: number;
  metadata?: Record<string, string | number | boolean | null>;
};

export interface AuditEvent {
  id: string;
  type: string;
  occurredAt: string;
  actorUserId?: number;
  actorLogin?: string;
  scopes?: string[];
  installationCount?: number;
  error?: string;
  message?: string;
  sessionIdPresent?: boolean;
  ip?: string;
  userAgent?: string;
  runId?: string;
  command?: string;
  runsCleaned?: number;
  metadata?: Record<string, string | number | boolean | null>;
}

type MemoryRing = AuditEvent[];
const memoryRing: MemoryRing = (globalThis as { __gitpulseAuditRing?: MemoryRing }).__gitpulseAuditRing ?? [];
if (!(globalThis as { __gitpulseAuditRing?: MemoryRing }).__gitpulseAuditRing) {
  (globalThis as { __gitpulseAuditRing?: MemoryRing }).__gitpulseAuditRing = memoryRing;
}
const MAX_MEMORY = 500;

const SECRET_KEY_PATTERN = /(password|passwd|token|access_token|authorization|secret|client_secret|code|set-cookie)/i;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/g;
const URL_SECRET_PATTERN = /https?:\/\/[^\s/]*:[^\s/@]+@[^\s/]+/g;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// redact strips anything that could carry a secret. The output is safe to
// persist and to display in operator consoles.
//
// Strategy:
//   1. Bearer tokens in any string are replaced.
//   2. Userinfo in URLs is replaced (e.g. https://user:pass@host/...).
//   3. Email addresses are masked.
//   4. Object keys whose name looks secret-like have their values
//      completely replaced with <redacted>. This is the strongest layer:
//      we never read or persist the value at all.
//
// Note: this function does NOT scan free text for `password: foo`
// patterns. Doing so generates too many false positives and would risk
// rewriting harmless user-supplied messages. The defence in depth is
// that audit log call sites must pass structured objects with
// well-named keys, never free-text log dumps.
export function redact(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    let out = value.replace(BEARER_PATTERN, 'Bearer <redacted>');
    out = out.replace(URL_SECRET_PATTERN, (m) => m.replace(/:[^/@]+@/, ':<redacted>@'));
    out = out.replace(EMAIL_PATTERN, '<email>');
    if (out.length > MAX_EVENT_LENGTH) {
      out = out.slice(0, MAX_EVENT_LENGTH - 13) + '...<truncated>';
    }
    return out;
  }
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(k)) {
        result[k] = '<redacted>';
      } else {
        result[k] = redact(v);
      }
    }
    return result;
  }
  return value;
}

function kvAvailable(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function randomEventId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function appendAuditEvent(input: AuditEventInput): Promise<void> {
  const event: AuditEvent = {
    id: randomEventId(),
    occurredAt: new Date().toISOString(),
    ...redact(input) as Omit<AuditEvent, 'id' | 'occurredAt'>,
  };

  if (kvAvailable()) {
    try {
      const dayKey = event.occurredAt.slice(0, 10);
      await kv.set(`${KV_PREFIX}${dayKey}:${event.id}`, JSON.stringify(event), { ex: TTL_SECONDS });
      return;
    } catch (error) {
      console.warn('[audit] KV write failed, falling back to memory ring:', error);
    }
  }

  memoryRing.push(event);
  if (memoryRing.length > MAX_MEMORY) {
    memoryRing.splice(0, memoryRing.length - MAX_MEMORY);
  }
}

export async function readAuditEventsForDay(day: string): Promise<AuditEvent[]> {
  if (!kvAvailable()) return [];
  try {
    const list = await kv.keys(`${KV_PREFIX}${day}:*`);
    if (!list.length) return [];
    const values = await kv.mget<string[]>(...list);
    return values
      .filter((v): v is string => typeof v === 'string')
      .map((v) => JSON.parse(v) as AuditEvent)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  } catch (error) {
    console.warn('[audit] KV read failed:', error);
    return [];
  }
}