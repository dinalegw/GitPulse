import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const sandbox = readFileSync(new URL('../lib/sandbox.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/playground/run/route.ts', import.meta.url), 'utf8');
const inputRoute = readFileSync(new URL('../app/api/playground/input/route.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/playground/page.tsx', import.meta.url), 'utf8');
const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('playground executes sandbox in one request without KV reconnect', () => {
  assert.match(route, /runSandboxCommand/);
  assert.doesNotMatch(route, /createSandboxSession|executeCommand\(sessionId|reconnectSandboxSession/);
  assert.doesNotMatch(sandbox, /@vercel\/kv|Sandbox\.get\(|Session not found or expired/);
});

test('sandbox bootstrap avoids E2B, package managers, and shell composition', () => {
  assert.doesNotMatch(sandbox, /@e2b\/code-interpreter|E2B_API_KEY/);
  assert.doesNotMatch(sandbox, /apt-get|\bdnf\b|\.join\(['"] && ['"]\)/);
  assert.doesNotMatch(sandbox, /runCommand\(sandbox, ['"]bash['"]/);
  assert.match(sandbox, /GO_SHA256/);
  assert.match(sandbox, /checksum mismatch/i);
  assert.match(sandbox, /GitPulse build completed but the executable is unavailable/);
});

test('sandbox cleanup deletes the disposable sandbox in finally', () => {
  assert.match(sandbox, /finally\s*{/);
  assert.match(sandbox, /sandbox\.delete\(\)/);
  assert.doesNotMatch(sandbox, /sandbox\.stop\(\)/);
});

test('GitHub credentials are explicitly absent from sandbox commands', () => {
  assert.match(sandbox, /GITHUB_TOKEN:\s*''/);
  assert.match(sandbox, /GH_TOKEN:\s*''/);
  assert.match(sandbox, /GIT_TERMINAL_PROMPT:\s*'0'/);
  assert.match(sandbox, /credential\.helper=/);
});

test('unsupported interactive input fails explicitly instead of session lookup', () => {
  assert.match(inputRoute, /INTERACTIVE_DISABLED/);
  assert.match(inputRoute, /status:\s*410/);
  assert.doesNotMatch(inputRoute, /Session not found or expired|getSession/);
  assert.doesNotMatch(page, /\/api\/playground\/input/);
});

test('frontend has a synchronous duplicate-click guard', () => {
  assert.match(page, /requestInFlightRef/);
  assert.match(page, /requestInFlightRef\.current\s*\|\|\s*isActive/);
  assert.match(page, /finally\s*{[\s\S]*requestInFlightRef\.current\s*=\s*false/);
});

test('Vercel and CI share explicit Node and pnpm toolchains', () => {
  assert.equal(pkg.packageManager, 'pnpm@10.34.5');
  assert.equal(pkg.engines.node, '24.x');
  assert.equal(pkg.dependencies['@vercel/sandbox'], '3.2.2');
  assert.match(ci, /pnpm install --frozen-lockfile/);
  assert.match(ci, /node-version:\s*\$\{\{ matrix\.node \}\}/);
  assert.doesNotMatch(ci, /E2B_API_KEY/);
});

test('only pnpm lockfile is used for the website', () => {
  assert.equal(existsSync(new URL('../pnpm-lock.yaml', import.meta.url)), true);
  assert.equal(existsSync(new URL('../package-lock.json', import.meta.url)), false);
  assert.equal(existsSync(new URL('../yarn.lock', import.meta.url)), false);
});

test('timeout and cleanup result states are represented explicitly', () => {
  assert.match(route, /lifecycleState:\s*'DISPOSED'/);
  assert.match(route, /CLEANUP_FAILED/);
  assert.match(route, /resultState/);
  assert.match(sandbox, /TIMED_OUT/);
  assert.match(sandbox, /PlaygroundTimeoutError/);
});

test('resource-heavy playground modes are blocked by shared policy', () => {
  assert.match(sandbox, /validatePlaygroundCommand/);
  assert.match(route, /validatePlaygroundRequestBody/);
});
