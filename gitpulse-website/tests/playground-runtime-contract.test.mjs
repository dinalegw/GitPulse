import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sandbox = readFileSync(new URL('../lib/sandbox.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/playground/run/route.ts', import.meta.url), 'utf8');
const inputRoute = readFileSync(new URL('../app/api/playground/input/route.ts', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('playground executes sandbox in one request without KV reconnect', () => {
  assert.match(route, /runSandboxCommand/);
  assert.doesNotMatch(route, /createSandboxSession|executeCommand\(sessionId|reconnectSandboxSession/);
  assert.doesNotMatch(sandbox, /@vercel\/kv|Sandbox\.get\(|Session not found or expired/);
});

test('sandbox bootstrap avoids distro package managers and shell composition', () => {
  assert.doesNotMatch(sandbox, /apt-get|\bdnf\b|\.join\(['"] && ['"]\)/);
  assert.doesNotMatch(sandbox, /runCommand\(sandbox, ['"]bash['"]/);
  assert.match(sandbox, /GO_SHA256/);
  assert.match(sandbox, /checksum mismatch/i);
});

test('unsupported interactive input fails explicitly instead of session lookup', () => {
  assert.match(inputRoute, /INTERACTIVE_DISABLED/);
  assert.match(inputRoute, /status:\s*410/);
  assert.doesNotMatch(inputRoute, /Session not found or expired|getSession/);
});

test('Vercel and CI share an explicit pnpm toolchain', () => {
  assert.equal(pkg.packageManager, 'pnpm@10.34.5');
  assert.equal(pkg.dependencies['@vercel/sandbox'], '3.2.2');
});

test('resource-heavy playground modes are blocked', () => {
  assert.match(sandbox, /Scheduled\/daemon mode is disabled/);
  assert.match(sandbox, /between 1 and 5/);
  assert.match(sandbox, /Streaming --tail mode is disabled/);
});
