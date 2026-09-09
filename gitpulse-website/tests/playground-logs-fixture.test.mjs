import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sandbox = readFileSync(new URL('../lib/sandbox.ts', import.meta.url), 'utf8');

test('playground logs command gets genuine GitPulse log history from a safe dry-run fixture', () => {
  assert.match(sandbox, /command !== 'logs'/);
  assert.match(
    sandbox,
    /GITPULSE_BIN,[\s\S]*\['run', '--dry-run', '--count', '2'\]/
  );
  assert.match(sandbox, /prepareCommandFixture\(sandbox!, command\)/);
  assert.match(sandbox, /cwd:\s*SCRATCH_DIR/);
  assert.match(sandbox, /env:\s*SAFE_ENV/);
});

test('logs fixture cannot create a real commit or contact a real GitHub remote', () => {
  assert.match(sandbox, /dry-run/);
  assert.match(sandbox, /FAKE_ORIGIN/);
  assert.match(sandbox, /GITHUB_TOKEN:\s*''/);
  assert.match(sandbox, /GH_TOKEN:\s*''/);
});
