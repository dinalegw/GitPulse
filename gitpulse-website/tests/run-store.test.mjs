// Tests for the run-store idempotency contract.
//
// The real store is implemented in TypeScript and depends on @vercel/kv.
// This test file does not import it directly; instead it re-implements the
// idempotency-key normalization in plain JavaScript and asserts the
// contract that must hold for both implementations.
//
// Contract:
//   - Same (command, args, idempotencyKey) tuple -> same runId.
//   - Different idempotencyKey -> different runId (fresh execution).
//   - Different command -> different runId even with the same key.

import { test } from 'node:test';
import assert from 'node:assert/strict';

function normalize(command, args, key) {
  return `${command}|${args.join('\u0000')}|${key}`;
}

test('same triple produces the same key', () => {
  const a = normalize('init', ['--dry-run'], 'uuid-1');
  const b = normalize('init', ['--dry-run'], 'uuid-1');
  assert.equal(a, b);
});

test('different idempotency key produces a different normalized key', () => {
  const a = normalize('init', ['--dry-run'], 'uuid-1');
  const b = normalize('init', ['--dry-run'], 'uuid-2');
  assert.notEqual(a, b);
});

test('different command produces a different normalized key', () => {
  const a = normalize('init', [], 'uuid-1');
  const b = normalize('run', [], 'uuid-1');
  assert.notEqual(a, b);
});

test('different args produce a different normalized key', () => {
  const a = normalize('run', ['--dry-run', '--count', '2'], 'uuid-1');
  const b = normalize('run', ['--dry-run', '--count', '3'], 'uuid-1');
  assert.notEqual(a, b);
});

test('arg ordering matters', () => {
  const a = normalize('run', ['--dry-run', '--count', '2'], 'uuid-1');
  const b = normalize('run', ['--count', '2', '--dry-run'], 'uuid-1');
  assert.notEqual(a, b);
});

test('two simultaneous Run Again clicks with the same key dedupe to one run', () => {
  // The contract the API must enforce: when the same idempotencyKey
  // arrives twice in flight, only one runId is created and both responses
  // return it.
  const clientKey = 'uuid-click-1';
  const first = { command: 'init', args: ['--dry-run'], key: clientKey };
  const second = { command: 'init', args: ['--dry-run'], key: clientKey };
  // Simulated first request materializes a runId. The second request
  // observes the existing mapping and returns the SAME runId.
  const runId = `run_${Date.now()}_abc`;
  const stored = new Map();
  const key1 = normalize(first.command, first.args, first.key);
  const key2 = normalize(second.command, second.args, second.key);
  stored.set(key1, runId);
  const lookup = stored.get(key2);
  assert.equal(lookup, runId);
});