from pathlib import Path

path = Path("gitpulse-website/lib/sandbox.ts")
source = path.read_text()

old = "const CREATE_TIMEOUT_MS = 20_000;\n"
if old not in source:
    raise SystemExit("create timeout marker missing")
source = source.replace(old, old + "const CLEANUP_TIMEOUT_MS = 10_000;\n", 1)

old = "async function setupScratchRepo(sandbox: Sandbox): Promise<void> {"
if old not in source:
    raise SystemExit("setupScratchRepo signature missing")
source = source.replace(
    old,
    "async function setupScratchRepo(\n  sandbox: Sandbox,\n  command: string\n): Promise<void> {",
    1,
)

start = source.index("async function setupScratchRepo(")
close_marker = "\n}\n\nasync function createSandbox(): Promise<Sandbox> {"
end = source.index(close_marker, start)
baseline = r'''
  // Seed every non-init command with a valid sandbox-local GitPulse config.
  // The execution remains disposable and dry-run by default.
  if (command !== 'init') {
    const configDir = `${SANDBOX_HOME}/.gitpulse`;
    const configPath = `${configDir}/config.yaml`;
    await runChecked(sandbox, 'mkdir', ['-p', configDir], { env: SAFE_ENV });

    const config = [
      'enabled: false',
      `repository_path: "${SCRATCH_DIR}"`,
      'remote_branch: "main"',
      'commits_per_day: 2',
      'dry_run: true',
      'push_remote: "origin"',
      '',
    ].join('\n');

    await sandbox.writeFiles([
      {
        path: configPath,
        content: Buffer.from(config, 'utf8'),
      },
    ]);
  }
'''
source = source[:end] + "\n" + baseline + source[end:]

old = "          await setupScratchRepo(sandbox!);"
if old not in source:
    raise SystemExit("setupScratchRepo call missing")
source = source.replace(old, "          await setupScratchRepo(sandbox!, command);", 1)

old = ".then((lateSandbox) => lateSandbox.delete())"
if old not in source:
    raise SystemExit("late cleanup marker missing")
source = source.replace(
    old,
    """.then((lateSandbox) =>
          withTimeout(
            lateSandbox.delete(),
            CLEANUP_TIMEOUT_MS,
            'Late sandbox cleanup timed out'
          )
        )""",
    1,
)

old = "        await sandbox.delete();"
if old not in source:
    raise SystemExit("final cleanup marker missing")
source = source.replace(
    old,
    """        await withTimeout(
          sandbox.delete(),
          CLEANUP_TIMEOUT_MS,
          'Sandbox cleanup timed out'
        );""",
    1,
)
path.write_text(source)

commands_path = Path("gitpulse-website/lib/commands.ts")
commands = commands_path.read_text()
old = "{ name: '--dry-run', description: 'Simulate initialization without writing config', type: 'boolean' },"
new = "{ name: '--dry-run', description: 'Initialize with dry_run enabled so later runs are simulated', type: 'boolean' },"
if old not in commands:
    raise SystemExit("init dry-run metadata marker missing")
commands_path.write_text(commands.replace(old, new, 1))

Path("gitpulse-website/tests/playground-sandbox-baseline.test.mjs").write_text(r'''import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sandbox = readFileSync(new URL('../lib/sandbox.ts', import.meta.url), 'utf8');
const commands = readFileSync(new URL('../lib/commands.ts', import.meta.url), 'utf8');

test('non-init commands receive a valid scratch-repo config', () => {
  assert.match(sandbox, /command !== 'init'/);
  assert.match(sandbox, /repository_path:/);
  assert.match(sandbox, /dry_run: true/);
  assert.match(sandbox, /push_remote:/);
  assert.match(sandbox, /setupScratchRepo\(sandbox!, command\)/);
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
''')
