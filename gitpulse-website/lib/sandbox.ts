import { Sandbox } from '@vercel/sandbox';
import { PLAYGROUND_COMMANDS, CONFIG_KEYS } from './commands';
import { validatePlaygroundCommand } from './playground-policy';

const SCRATCH_DIR = '/vercel/sandbox/scratch-repo';
const SOURCE_DIR = '/vercel/sandbox/gitpulse-src';
const BIN_DIR = '/vercel/sandbox/bin';
const GITPULSE_BIN = BIN_DIR + '/gitpulse';
const SANDBOX_HOME = '/vercel/sandbox/home';
const FAKE_ORIGIN = '/vercel/sandbox/fake-origin.git';
const GO_ROOT = '/vercel/sandbox/go';
const GO_VERSION = '1.26.3';

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const MAX_SESSION_SECONDS = boundedInteger(
  process.env.PLAYGROUND_MAX_SECONDS,
  60,
  30,
  240
);
const CREATE_TIMEOUT_MS = 20_000;
const CLEANUP_TIMEOUT_MS = 10_000;
const SANDBOX_TIMEOUT_MS = Math.min(285_000, (MAX_SESSION_SECONDS + 30) * 1000);

const GO_SHA256: Record<'amd64' | 'arm64', string> = {
  amd64: '2b2cfc7148493da5e73981bffbf3353af381d5f93e789c82c79aff64962eb556',
  arm64: '9d89a3ea57d141c2b22d70083f2c8459ba3890f2d9e818e7e933b75614936565',
};

const SAFE_ENV: Record<string, string> = {
  HOME: SANDBOX_HOME,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'Never',
  GH_TOKEN: '',
  GITHUB_TOKEN: '',
  GIT_ASKPASS: '',
};

export type SandboxResultState =
  | 'SUCCEEDED'
  | 'FAILED'
  | 'START_FAILED'
  | 'TIMED_OUT';

export interface SandboxCommandResult {
  state: SandboxResultState;
  exitCode?: number;
  stdout: string;
  stderr: string;
  error?: string;
  cleanupError?: string;
}

type RunOptions = {
  cwd?: string;
  env?: Record<string, string>;
  sudo?: boolean;
};

class PlaygroundTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaygroundTimeoutError';
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  message: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new PlaygroundTimeoutError(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runCommand(
  sandbox: Sandbox,
  cmd: string,
  args: string[],
  options: RunOptions = {}
) {
  return sandbox.runCommand({
    cmd,
    args,
    cwd: options.cwd,
    env: options.env,
    sudo: options.sudo,
  });
}

async function runChecked(
  sandbox: Sandbox,
  cmd: string,
  args: string[],
  options: RunOptions = {}
): Promise<string> {
  let result;
  try {
    result = await runCommand(sandbox, cmd, args, options);
  } catch (error) {
    throw new Error(
      `${cmd} could not start: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const stdout = await result.stdout();
  const stderr = await result.stderr();
  if (result.exitCode !== 0) {
    throw new Error(
      stderr.trim() || stdout.trim() || `${cmd} failed with exit code ${result.exitCode}`
    );
  }
  return stdout;
}

async function commandAvailable(
  sandbox: Sandbox,
  cmd: string,
  args: string[] = ['--version']
): Promise<boolean> {
  try {
    const result = await runCommand(sandbox, cmd, args);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function assertNoGitHubCredentials(sandbox: Sandbox): Promise<void> {
  const script = [
    'const names=["GH_TOKEN","GITHUB_TOKEN","GIT_ASKPASS"];',
    'const leaked=names.filter((name)=>Boolean(process.env[name]));',
    'if(leaked.length){console.error("credential environment present: "+leaked.join(","));process.exit(1)}',
  ].join('');

  await runChecked(sandbox, 'node', ['-e', script], { env: SAFE_ENV });
}

async function ensureGo(sandbox: Sandbox): Promise<string> {
  if (await commandAvailable(sandbox, 'go', ['version'])) {
    return 'go';
  }

  if (!(await commandAvailable(sandbox, 'node', ['--version']))) {
    throw new Error('Vercel Sandbox runtime is missing Node.js; cannot bootstrap Go');
  }
  if (!(await commandAvailable(sandbox, 'tar', ['--version']))) {
    throw new Error('Vercel Sandbox runtime is missing tar; cannot bootstrap Go');
  }

  const machine = (await runChecked(sandbox, 'uname', ['-m'])).trim();
  let arch: 'amd64' | 'arm64';
  if (machine === 'x86_64' || machine === 'amd64') {
    arch = 'amd64';
  } else if (machine === 'aarch64' || machine === 'arm64') {
    arch = 'arm64';
  } else {
    throw new Error(`Unsupported Vercel Sandbox architecture: ${machine}`);
  }

  const tarball = `/vercel/sandbox/go${GO_VERSION}.linux-${arch}.tar.gz`;
  const url = `https://go.dev/dl/go${GO_VERSION}.linux-${arch}.tar.gz`;
  const expectedSha = GO_SHA256[arch];

  const downloader = [
    'const fs=require("fs");',
    'const crypto=require("crypto");',
    'const [url,file,expected]=process.argv.slice(-3);',
    '(async()=>{',
    ' const r=await fetch(url);',
    ' if(!r.ok) throw new Error("download failed: HTTP "+r.status);',
    ' const b=Buffer.from(await r.arrayBuffer());',
    ' const actual=crypto.createHash("sha256").update(b).digest("hex");',
    ' if(actual!==expected) throw new Error("Go checksum mismatch: "+actual);',
    ' fs.writeFileSync(file,b);',
    '})().catch(e=>{console.error(e.message||e);process.exit(1)});',
  ].join('');

  await runChecked(sandbox, 'node', ['-e', downloader, url, tarball, expectedSha]);
  await runChecked(sandbox, 'rm', ['-rf', GO_ROOT]);
  await runChecked(sandbox, 'mkdir', ['-p', GO_ROOT]);
  await runChecked(sandbox, 'tar', [
    '-xzf',
    tarball,
    '-C',
    GO_ROOT,
    '--strip-components=1',
  ]);

  const goBin = `${GO_ROOT}/bin/go`;
  if (!(await commandAvailable(sandbox, goBin, ['version']))) {
    throw new Error('Go bootstrap completed but the Go executable is unavailable');
  }
  return goBin;
}

function sourceRef(): string {
  const candidate =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITPULSE_PLAYGROUND_SOURCE_REF ||
    'main';

  if (!/^[A-Za-z0-9._/-]{1,100}$/.test(candidate)) {
    return 'main';
  }
  return candidate;
}

async function setupGitPulseSource(
  sandbox: Sandbox,
  goBin: string
): Promise<void> {
  await runChecked(sandbox, 'git', ['init', SOURCE_DIR], { env: SAFE_ENV });
  await runChecked(
    sandbox,
    'git',
    [
      '-c',
      'credential.helper=',
      '-c',
      'core.askPass=',
      '-C',
      SOURCE_DIR,
      'remote',
      'add',
      'origin',
      'https://github.com/dinalegw/GitPulse.git',
    ],
    { env: SAFE_ENV }
  );

  await runChecked(
    sandbox,
    'git',
    [
      '-c',
      'credential.helper=',
      '-c',
      'core.askPass=',
      '-C',
      SOURCE_DIR,
      'fetch',
      '--depth',
      '1',
      'origin',
      sourceRef(),
    ],
    { env: SAFE_ENV }
  );

  await runChecked(sandbox, 'git', ['-C', SOURCE_DIR, 'checkout', '--detach', 'FETCH_HEAD'], {
    env: SAFE_ENV,
  });

  await runChecked(
    sandbox,
    goBin,
    ['build', '-trimpath', '-o', GITPULSE_BIN, '.'],
    { cwd: SOURCE_DIR, env: SAFE_ENV }
  );

  if (!(await commandAvailable(sandbox, GITPULSE_BIN, ['version']))) {
    throw new Error('GitPulse build completed but the executable is unavailable');
  }
}

async function setupScratchRepo(
  sandbox: Sandbox,
  command: string
): Promise<void> {
  if (!(await commandAvailable(sandbox, 'git', ['--version']))) {
    throw new Error('Vercel Sandbox image does not provide git');
  }
  if (!(await commandAvailable(sandbox, 'node', ['--version']))) {
    throw new Error('Vercel Sandbox image does not provide Node.js');
  }

  await runChecked(sandbox, 'rm', [
    '-rf',
    SCRATCH_DIR,
    SOURCE_DIR,
    BIN_DIR,
    SANDBOX_HOME,
    FAKE_ORIGIN,
  ]);
  await runChecked(sandbox, 'mkdir', ['-p', SCRATCH_DIR, BIN_DIR, SANDBOX_HOME]);

  await assertNoGitHubCredentials(sandbox);
  const goBin = await ensureGo(sandbox);
  await setupGitPulseSource(sandbox, goBin);

  await runChecked(sandbox, 'git', ['init'], { cwd: SCRATCH_DIR, env: SAFE_ENV });
  await runChecked(sandbox, 'git', ['branch', '-M', 'main'], {
    cwd: SCRATCH_DIR,
    env: SAFE_ENV,
  });
  await runChecked(
    sandbox,
    'git',
    ['config', 'user.email', 'playground@gitpulse.local'],
    { cwd: SCRATCH_DIR, env: SAFE_ENV }
  );
  await runChecked(
    sandbox,
    'git',
    ['config', 'user.name', 'GitPulse Playground'],
    { cwd: SCRATCH_DIR, env: SAFE_ENV }
  );

  await sandbox.writeFiles([
    {
      path: `${SCRATCH_DIR}/README.md`,
      content: Buffer.from('# Scratch Repository\n', 'utf8'),
    },
  ]);

  await runChecked(sandbox, 'git', ['add', 'README.md'], {
    cwd: SCRATCH_DIR,
    env: SAFE_ENV,
  });
  await runChecked(sandbox, 'git', ['commit', '-m', 'Initial commit'], {
    cwd: SCRATCH_DIR,
    env: SAFE_ENV,
  });

  await runChecked(sandbox, 'git', ['init', '--bare', FAKE_ORIGIN], {
    env: SAFE_ENV,
  });
  await runChecked(sandbox, 'git', ['remote', 'add', 'origin', FAKE_ORIGIN], {
    cwd: SCRATCH_DIR,
    env: SAFE_ENV,
  });
  await runChecked(sandbox, 'git', ['push', '-u', 'origin', 'main'], {
    cwd: SCRATCH_DIR,
    env: SAFE_ENV,
  });

  const remote = (
    await runChecked(sandbox, 'git', ['remote', 'get-url', 'origin'], {
      cwd: SCRATCH_DIR,
      env: SAFE_ENV,
    })
  ).trim();
  if (remote !== FAKE_ORIGIN) {
    throw new Error('Scratch repository origin is not the disposable local bare repository');
  }

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

}

async function createSandbox(): Promise<Sandbox> {
  const pending = Sandbox.create({
    runtime: 'node24',
    persistent: false,
    timeout: SANDBOX_TIMEOUT_MS,
    env: SAFE_ENV,
    tags: {
      app: 'gitpulse',
      purpose: 'playground',
    },
  });

  try {
    return await withTimeout(
      pending,
      CREATE_TIMEOUT_MS,
      'Vercel Sandbox creation timed out'
    );
  } catch (error) {
    if (error instanceof PlaygroundTimeoutError) {
      void pending
        .then((lateSandbox) =>
          withTimeout(
            lateSandbox.delete(),
            CLEANUP_TIMEOUT_MS,
            'Late sandbox cleanup timed out'
          )
        )
        .catch((cleanupError) => {
          console.error('[Sandbox] Late sandbox cleanup failed:', cleanupError);
        });
    }
    throw error;
  }
}

export async function runSandboxCommand(
  command: string,
  args: string[],
  onReady?: () => Promise<void> | void
): Promise<SandboxCommandResult> {
  let sandbox: Sandbox | null = null;
  let executionStarted = false;
  let result: SandboxCommandResult = {
    state: 'START_FAILED',
    stdout: '',
    stderr: '',
  };

  try {
    try {
      sandbox = await createSandbox();
    } catch (error) {
      result = {
        state:
          error instanceof PlaygroundTimeoutError
            ? 'TIMED_OUT'
            : executionStarted
              ? 'FAILED'
              : 'START_FAILED',
        stdout: '',
        stderr: '',
        error: error instanceof Error ? error.message : String(error),
      };
      return result;
    }

    try {
      result = await withTimeout(
        (async () => {
          await setupScratchRepo(sandbox!, command);
          await onReady?.();
          executionStarted = true;

          let commandResult;
          try {
            commandResult = await runCommand(
              sandbox!,
              GITPULSE_BIN,
              [command, ...args],
              {
                cwd: SCRATCH_DIR,
                env: SAFE_ENV,
              }
            );
          } catch (error) {
            return {
              state: 'FAILED' as const,
              stdout: '',
              stderr: '',
              error:
                error instanceof Error
                  ? `GitPulse command could not start: ${error.message}`
                  : 'GitPulse command could not start',
            };
          }

          const stdout = await commandResult.stdout();
          const stderr = await commandResult.stderr();

          return {
            state: commandResult.exitCode === 0 ? ('SUCCEEDED' as const) : ('FAILED' as const),
            exitCode: commandResult.exitCode,
            stdout,
            stderr,
            error:
              commandResult.exitCode === 0
                ? undefined
                : stderr.trim() || `GitPulse exited with code ${commandResult.exitCode}`,
          };
        })(),
        MAX_SESSION_SECONDS * 1000,
        `Playground execution exceeded ${MAX_SESSION_SECONDS} seconds`
      );
    } catch (error) {
      result = {
        state:
          error instanceof PlaygroundTimeoutError ? 'TIMED_OUT' : 'START_FAILED',
        stdout: '',
        stderr: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } finally {
    if (sandbox) {
      try {
        await withTimeout(
          sandbox.delete(),
          CLEANUP_TIMEOUT_MS,
          'Sandbox cleanup timed out'
        );
      } catch (cleanupError) {
        result.cleanupError =
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError);
      }
    }
  }

  return result;
}

export function validateCommand(
  command: string,
  args: string[]
): { valid: boolean; error?: string } {
  return validatePlaygroundCommand(
    command,
    args,
    PLAYGROUND_COMMANDS,
    CONFIG_KEYS,
    SCRATCH_DIR
  );
}

export { MAX_SESSION_SECONDS };
