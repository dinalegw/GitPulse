import { Sandbox } from '@vercel/sandbox';

const MAX_SESSION_SECONDS = parseInt(process.env.PLAYGROUND_MAX_SECONDS || '60', 10);
const SCRATCH_DIR = '/vercel/sandbox/scratch-repo';
const SOURCE_DIR = '/vercel/sandbox/gitpulse-src';
const BIN_DIR = '/vercel/sandbox/bin';
const GITPULSE_BIN = BIN_DIR + '/gitpulse';
const SANDBOX_HOME = '/vercel/sandbox/home';
const FAKE_ORIGIN = '/vercel/sandbox/fake-origin.git';
const GO_ROOT = '/vercel/sandbox/go';
const GO_VERSION = '1.26.3';

const GO_SHA256: Record<'amd64' | 'arm64', string> = {
  amd64: '2b2cfc7148493da5e73981bffbf3353af381d5f93e789c82c79aff64962eb556',
  arm64: '9d89a3ea57d141c2b22d70083f2c8459ba3890f2d9e818e7e933b75614936565',
};

export interface SandboxCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  cleanupError?: string;
}

type RunOptions = {
  cwd?: string;
  env?: Record<string, string>;
  sudo?: boolean;
};

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
  await runChecked(sandbox, 'tar', ['-xzf', tarball, '-C', GO_ROOT, '--strip-components=1']);

  const goBin = `${GO_ROOT}/bin/go`;
  if (!(await commandAvailable(sandbox, goBin, ['version']))) {
    throw new Error('Go bootstrap completed but the Go executable is unavailable');
  }
  return goBin;
}

async function setupScratchRepo(sandbox: Sandbox): Promise<void> {
  if (!(await commandAvailable(sandbox, 'git', ['--version']))) {
    throw new Error('Vercel Sandbox image does not provide git');
  }

  const goBin = await ensureGo(sandbox);

  await runChecked(sandbox, 'rm', [
    '-rf',
    SCRATCH_DIR,
    SOURCE_DIR,
    BIN_DIR,
    SANDBOX_HOME,
    FAKE_ORIGIN,
  ]);
  await runChecked(sandbox, 'mkdir', ['-p', SCRATCH_DIR, BIN_DIR, SANDBOX_HOME]);

  await runChecked(sandbox, 'git', [
    'clone',
    '--depth',
    '1',
    'https://github.com/dinalegw/GitPulse.git',
    SOURCE_DIR,
  ]);

  await runChecked(
    sandbox,
    goBin,
    ['build', '-trimpath', '-o', GITPULSE_BIN, '.'],
    { cwd: SOURCE_DIR }
  );

  await runChecked(sandbox, 'git', ['init'], { cwd: SCRATCH_DIR });
  await runChecked(sandbox, 'git', ['branch', '-M', 'main'], { cwd: SCRATCH_DIR });
  await runChecked(
    sandbox,
    'git',
    ['config', 'user.email', 'playground@gitpulse.local'],
    { cwd: SCRATCH_DIR }
  );
  await runChecked(
    sandbox,
    'git',
    ['config', 'user.name', 'GitPulse Playground'],
    { cwd: SCRATCH_DIR }
  );

  await sandbox.writeFiles([
    {
      path: `${SCRATCH_DIR}/README.md`,
      content: Buffer.from('# Scratch Repository\n', 'utf8'),
    },
  ]);

  await runChecked(sandbox, 'git', ['add', 'README.md'], { cwd: SCRATCH_DIR });
  await runChecked(sandbox, 'git', ['commit', '-m', 'Initial commit'], { cwd: SCRATCH_DIR });

  await runChecked(sandbox, 'git', ['init', '--bare', FAKE_ORIGIN]);
  await runChecked(sandbox, 'git', ['remote', 'add', 'origin', FAKE_ORIGIN], {
    cwd: SCRATCH_DIR,
  });
  await runChecked(sandbox, 'git', ['push', '-u', 'origin', 'main'], {
    cwd: SCRATCH_DIR,
  });
}

export async function runSandboxCommand(
  command: string,
  args: string[],
  onReady?: () => Promise<void> | void
): Promise<SandboxCommandResult> {
  let sandbox: Sandbox | null = null;
  let response: SandboxCommandResult | null = null;
  let primaryError: unknown;

  try {
    sandbox = await Sandbox.create({
      runtime: 'node24',
      persistent: false,
      timeout: Math.max(MAX_SESSION_SECONDS, 180) * 1000,
      env: {
        HOME: SANDBOX_HOME,
        GIT_CONFIG_NOSYSTEM: '1',
      },
      tags: {
        app: 'gitpulse',
        purpose: 'playground',
      },
    });

    await setupScratchRepo(sandbox);
    await onReady?.();

    const result = await runCommand(sandbox, GITPULSE_BIN, [command, ...args], {
      cwd: SCRATCH_DIR,
      env: {
        HOME: SANDBOX_HOME,
        GIT_CONFIG_NOSYSTEM: '1',
      },
    });

    response = {
      exitCode: result.exitCode,
      stdout: await result.stdout(),
      stderr: await result.stderr(),
    };
  } catch (error) {
    primaryError = error;
  } finally {
    if (sandbox) {
      try {
        await sandbox.stop();
      } catch (cleanupError) {
        const message =
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        if (response) {
          response.cleanupError = message;
        } else {
          console.error('[Sandbox] Cleanup failed after primary error:', message);
        }
      }
    }
  }

  if (primaryError) {
    throw primaryError;
  }
  if (!response) {
    throw new Error('Sandbox command produced no result');
  }
  return response;
}

export function validateCommand(command: string, args: string[]): { valid: boolean; error?: string } {
  const { PLAYGROUND_COMMANDS, CONFIG_KEYS } = require('./commands');

  const cmdMeta = PLAYGROUND_COMMANDS.find((c: { name: string }) => c.name === command);
  if (!cmdMeta) {
    return { valid: false, error: `Command '${command}' not allowed in playground` };
  }

  const allowedFlags = new Set(
    cmdMeta.flags.map((f: { name: string }) => f.name.split(' ')[0])
  );

  for (const arg of args) {
    if (arg.startsWith('--') || arg.startsWith('-')) {
      const flagName = arg.split('=')[0];
      if (!allowedFlags.has(flagName)) {
        return {
          valid: false,
          error: `Flag '${flagName}' not allowed for '${command}' in playground`,
        };
      }
    }
  }

  if (command === 'run') {
    if (args.includes('--schedule') || args.includes('--daemon')) {
      return {
        valid: false,
        error: 'Scheduled/daemon mode is disabled in the disposable playground',
      };
    }

    const countIndex = args.indexOf('--count');
    if (countIndex >= 0) {
      const rawCount = args[countIndex + 1];
      const count = Number(rawCount);
      if (!Number.isInteger(count) || count < 1 || count > 5) {
        return {
          valid: false,
          error: 'Playground --count must be an integer between 1 and 5',
        };
      }
    }
  }

  if (command === 'logs' && args.includes('--tail')) {
    return {
      valid: false,
      error: 'Streaming --tail mode is disabled in the disposable playground',
    };
  }

  if (command === 'config' && args.includes('set')) {
    const setIndex = args.indexOf('set');
    if (setIndex + 1 < args.length) {
      const key = args[setIndex + 1];
      if (!CONFIG_KEYS.includes(key as any)) {
        return { valid: false, error: `Invalid config key: ${key}` };
      }
    }
  }

  return { valid: true };
}
