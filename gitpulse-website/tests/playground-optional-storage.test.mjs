import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runs = readFileSync(new URL('../lib/run-store.ts', import.meta.url), 'utf8');
const rate = readFileSync(new URL('../lib/rate-limit.ts', import.meta.url), 'utf8');
const audit = readFileSync(new URL('../lib/audit-log.ts', import.meta.url), 'utf8');

test('distributed idempotency uses one atomic NX claim', () => {
  assert.match(runs, /nx:\s*true/);
  assert.match(runs, /atomic idempotency claim/);
  assert.doesNotMatch(runs, /const existing = await findRunByIdempotencyKey[\s\S]*kv\.set/);
});

test('optional KV paths have bounded latency and memory fallbacks', () => {
  assert.match(runs, /withOptionalStorageTimeout/);
  assert.match(rate, /withOptionalStorageTimeout/);
  assert.match(audit, /withOptionalStorageTimeout/);
  assert.match(runs, /falling back to same-instance claim/);
  assert.match(rate, /using in-memory limiter/);
  assert.match(audit, /falling back to memory ring/);
});
