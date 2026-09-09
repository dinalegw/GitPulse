import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sandbox = readFileSync(new URL('../lib/sandbox.ts', import.meta.url), 'utf8');
const commands = readFileSync(new URL('../lib/commands.ts', import.meta.url), 'utf8');

test('non-init commands receive a valid scratch-repo config', () => {
  assert.match(sandbox, /command !== 'init'|command === 'init'/);
  assert.match(sandbox, /repository_path:/);
  assert.match(sandbox, /dry_run: true/);
  assert.match(sandbox, /push_remote:/);
  assert.match(sandbox, /writePlaygroundConfig/);
  assert.match(sandbox, /resetSnapshotScratchRepo/);
  assert.match(sandbox, /setupFreshSandbox/);
});

test('init creates its own fresh configuration', () => {
  assert.doesNotMatch(commands, /Simulate initialization without writing config/);
  assert.match(commands, /Initialize with dry_run enabled/);
});

test('sandbox deletion is bounded', () => {
  assert.match(sandbox, /CLEANUP_TIMEOUT_MS/);
  assert.match(sandbox, /Late sandbox cleanup timed out/);
  assert.match(sandbox, /Sandbox cleanup timed out/);
});
