import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/playground/page.tsx', import.meta.url), 'utf8');
const terminal = readFileSync(new URL('../components/Terminal.tsx', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/playground/run/route.ts', import.meta.url), 'utf8');
const sandbox = readFileSync(new URL('../lib/sandbox.ts', import.meta.url), 'utf8');
const snapshot = readFileSync(new URL('../scripts/playground/create-runtime-snapshot.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('terminal renders the authoritative output directly in visible DOM', () => {
  assert.match(terminal, /<pre/);
  assert.match(terminal, /\{desiredOutput/);
  assert.match(terminal, /data-testid="playground-terminal-output"/);
  assert.match(terminal, /role="log"/);
  assert.doesNotMatch(terminal, /import\('xterm'\)/);
  assert.doesNotMatch(terminal, /term\.open\(/);
});

test('playground consumes one-request NDJSON and buffers live stdout/stderr', () => {
  assert.match(page, /createNdjsonParser/);
  assert.match(page, /streamedStdoutRef/);
  assert.match(page, /streamedStderrRef/);
  assert.match(page, /appendOutput\(event\.data\)/);
  assert.match(page, /output=\{output\}/);
  assert.doesNotMatch(page, /useTerminal\(\)/);
  assert.match(route, /application\/x-ndjson|PLAYGROUND_STREAM_CONTENT_TYPE/);
  assert.match(route, /type:\s*'stdout'/);
  assert.match(route, /type:\s*'stderr'/);
  assert.match(route, /type:\s*'result'/);
});

test('normal production fast path restores and verifies an immutable snapshot', () => {
  assert.match(sandbox, /type:\s*'snapshot'/);
  assert.match(sandbox, /verifySnapshotRuntime/);
  assert.match(sandbox, /binary checksum mismatch/i);
  assert.match(sandbox, /resetSnapshotScratchRepo/);
  assert.doesNotMatch(sandbox, /Sandbox\.get\(/);
  assert.match(snapshot, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(snapshot, /binarySha256/);
  assert.match(snapshot, /gitpulse-runtime\.json/);
  assert.match(snapshot, /sandbox\.snapshot/);
  assert.equal(pkg.scripts.build, 'pnpm run prepare:playground-runtime && next build');
});

test('runtime execution remains credential isolated and locally remote only', () => {
  assert.match(sandbox, /GITHUB_TOKEN:\s*''/);
  assert.match(sandbox, /GH_TOKEN:\s*''/);
  assert.match(sandbox, /FAKE_ORIGIN/);
  assert.match(sandbox, /Scratch repository origin is not the disposable local bare repository/);
});
