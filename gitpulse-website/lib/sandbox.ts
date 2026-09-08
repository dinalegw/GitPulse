// Vercel Sandbox client wrapper for GitPulse playground.
// Keeps sandbox state in Vercel KV so serverless requests can reconnect.

import { Sandbox } from '@vercel/sandbox';
import { kv } from '@vercel/kv';

export interface SandboxSession {
  sandboxName: string;
  createdAt: number;
  command: string;
  args: string[];
}

const MAX_SESSION_SECONDS = parseInt(process.env.PLAYGROUND_MAX_SECONDS || '60', 10);
const KV_SESSION_PREFIX = 'playground:session:';
const KV_CONCURRENT_PREFIX = 'playground:concurrent:';
const SCRATCH_DIR = '/vercel/sandbox/scratch-repo';
const BIN_DIR = '/vercel/sandbox/bin';
const GITPULSE_BIN = BIN_DIR + '/gitpulse';

async function saveSessionToKV(sessionId: string, session: SandboxSession): Promise<void> {
  try {
    await kv.set(`${KV_SESSION_PREFIX}${sessionId}`, JSON.stringify(session), {
      ex: MAX_SESSION_SECONDS + 30,
    });
  } catch (error) {
    console.error('[Sandbox] Failed to save session to KV:', error);
  }
}

async function loadSessionFromKV(sessionId: string): Promise<SandboxSession | null> {
  try {
    const data = await kv.get<string>(`${KV_SESSION_PREFIX}${sessionId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('[Sandbox] Failed to load session from KV:', error);
    return null;
  }
}

async function deleteSessionFromKV(sessionId: string): Promise<void> {
  try {
    await kv.del(`${KV_SESSION_PREFIX}${sessionId}`);
  } catch (error) {
    console.error('[Sandbox] Failed to delete session from KV:', error);
  }
}

async function incrementConcurrentSessions(ip: string): Promise<number> {
  try {
    const key = `${KV_CONCURRENT_PREFIX}${ip}`;
    const count = await kv.incr(key);
    if (count === 1) await kv.expire(key, MAX_SESSION_SECONDS * 2);
    return count;
  } catch (error) {
    console.error('[Sandbox] Failed to increment concurrent sessions:', error);
    return 1;
  }
}

async function decrementConcurrentSessions(ip: string): Promise<void> {
  try {
    const key = `${KV_CONCURRENT_PREFIX}${ip}`;
    const current = (await kv.get<number>(key)) || 0;
    if (current <= 1) {
      await kv.del(key);
    } else {
      await kv.decr(key);
    }
  } catch (error) {
    console.error('[Sandbox] Failed to decrement concurrent sessions:', error);
  }
}

async function getConcurrentSessions(ip: string): Promise<number> {
  try {
    return (await kv.get<number>(`${KV_CONCURRENT_PREFIX}${ip}`)) || 0;
  } catch (error) {
    console.error('[Sandbox] Failed to get concurrent sessions:', error);
    return 0;
  }
}

async function runChecked(
  sandbox: Sandbox,
  cmd: string,
  args: string[],
  options: { cwd?: string; sudo?: boolean } = {}
): Promise<void> {
  const result = await sandbox.runCommand({
    cmd,
    args,
    cwd: options.cwd,
    sudo: options.sudo,
  });
  if (result.exitCode !== 0) {
    const stderr = await result.stderr();
    const stdout = await result.stdout();
    throw new Error(stderr.trim() || stdout.trim() || `${cmd} failed with exit code ${result.exitCode}`);
  }
}

async function setupScratchRepo(sandbox: Sandbox): Promise<void> {
  // Vercel's universal image includes Git. Install Go only when it is absent.
  const goCheck = await sandbox.runCommand('bash', ['-lc', 'command -v go >/dev/null 2>&1']);
  if (goCheck.exitCode !== 0) {
    await runChecked(sandbox, 'apt-get', ['update'], { sudo: true });
    await runChecked(sandbox, 'apt-get', ['install', '-y', 'golang-go'], { sudo: true });
  }

  await runChecked(sandbox, 'bash', [
    '-lc',
    [
      'set -euo pipefail',
      `rm -rf "${SCRATCH_DIR}" /vercel/sandbox/fake-origin.git /vercel/sandbox/gitpulse-src "${BIN_DIR}"`,
      `mkdir -p "${SCRATCH_DIR}" "${BIN_DIR}"`,
      `git clone --depth 1 https://github.com/dinalegw/GitPulse.git /vercel/sandbox/gitpulse-src`,
      `cd /vercel/sandbox/gitpulse-src && go build -o "${GITPULSE_BIN}" .`,
      `cd "${SCRATCH_DIR}"`,
      'git init',
      'git branch -M main',
      'git config user.email "playground@gitpulse.local"',
      'git config user.name "GitPulse Playground"',
      'printf "# Scratch Repository\\n" > README.md',
      'git add README.md',
      'git commit -m "Initial commit"',
      'git init --bare /vercel/sandbox/fake-origin.git',
      'git remote add origin /vercel/sandbox/fake-origin.git',
      'git push -u origin main',
    ].join(' && '),
  ]);
}

export async function createSandboxSession(
  sessionId: string,
  command: string,
  args: string[],
  clientIp?: string
): Promise<SandboxSession> {
  if (clientIp) {
    const maxConcurrent = parseInt(process.env.PLAYGROUND_MAX_CONCURRENT_PER_IP || '3', 10);
    const concurrent = await getConcurrentSessions(clientIp);
    if (concurrent >= maxConcurrent) {
      throw new Error(`Too many concurrent sessions (max ${maxConcurrent}). Please wait for one to complete.`);
    }
    await incrementConcurrentSessions(clientIp);
  }

  let sandbox: Sandbox | null = null;
  try {
    sandbox = await Sandbox.create({
      runtime: 'node24',
      persistent: false,
      timeout: Math.max(MAX_SESSION_SECONDS, 180) * 1000,
      tags: { app: 'gitpulse', purpose: 'playground' },
    });

    await setupScratchRepo(sandbox);

    const session: SandboxSession = {
      sandboxName: sandbox.name,
      createdAt: Date.now(),
      command,
      args,
    };
    await saveSessionToKV(sessionId, session);
    return session;
  } catch (error) {
    if (sandbox) {
      try { await sandbox.delete(); } catch { /* best effort */ }
    }
    if (clientIp) await decrementConcurrentSessions(clientIp);
    throw error;
  }
}

export async function reconnectSandboxSession(
  sessionId: string
): Promise<{ sandbox: Sandbox; session: SandboxSession } | null> {
  const session = await loadSessionFromKV(sessionId);
  if (!session) return null;
  const sandbox = await Sandbox.get({ name: session.sandboxName });
  return { sandbox, session };
}

export async function executeCommand(
  sessionId: string,
  command: string,
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const reconnected = await reconnectSandboxSession(sessionId);
  if (!reconnected) throw new Error('Session not found or expired');

  const result = await reconnected.sandbox.runCommand({
    cmd: GITPULSE_BIN,
    args: [command, ...args],
    cwd: SCRATCH_DIR,
  });

  return {
    exitCode: result.exitCode,
    stdout: await result.stdout(),
    stderr: await result.stderr(),
  };
}

// The current Vercel Sandbox SDK does not expose a browser-addressable PTY API.
// Keep the flagship wizard usable by feeding safe demo answers server-side.
export async function startInteractiveProcess(
  sessionId: string,
  command: string,
  args: string[],
  onStdout: (data: string) => void,
  onStderr: (data: string) => void,
  onExit: (exitCode: number) => void
): Promise<void> {
  const reconnected = await reconnectSandboxSession(sessionId);
  if (!reconnected) throw new Error('Session not found or expired');

  let result;
  if (command === 'quick-wizard') {
    result = await reconnected.sandbox.runCommand({
      cmd: 'bash',
      args: ['-lc', `printf 'y\\n1\\n0\\nPlayground demo\\n' | "${GITPULSE_BIN}"`],
      cwd: SCRATCH_DIR,
    });
  } else {
    result = await reconnected.sandbox.runCommand({
      cmd: GITPULSE_BIN,
      args: [command, ...args],
      cwd: SCRATCH_DIR,
    });
  }

  const stdout = await result.stdout();
  const stderr = await result.stderr();
  if (stdout) onStdout(stdout);
  if (stderr) onStderr(stderr);
  onExit(result.exitCode);
}

export async function sendStdin(): Promise<void> {
  // Interactive browser stdin is intentionally disabled until Vercel exposes
  // a stable SDK PTY transport suitable for reconnecting serverless requests.
}

export async function resizePTY(): Promise<void> {
  // No-op for the non-PTY Vercel Sandbox transport.
}

export async function killProcess(sessionId: string): Promise<void> {
  const reconnected = await reconnectSandboxSession(sessionId);
  if (!reconnected) return;
  try {
    await reconnected.sandbox.stop();
  } catch (error) {
    console.error('[Sandbox] Error stopping sandbox:', error);
  }
}

export async function getSession(sessionId: string): Promise<SandboxSession | null> {
  return loadSessionFromKV(sessionId);
}

export async function cleanupSession(sessionId: string, clientIp?: string): Promise<void> {
  const reconnected = await reconnectSandboxSession(sessionId).catch(() => null);
  if (reconnected) {
    try {
      await reconnected.sandbox.delete();
    } catch (error) {
      console.error('[Sandbox] Error deleting sandbox:', error);
    }
  }
  await deleteSessionFromKV(sessionId);
  if (clientIp) await decrementConcurrentSessions(clientIp);
}

export async function cleanupExpiredSessions(): Promise<void> {
  console.log('[Sandbox] KV TTL handles session metadata expiration automatically');
}

export function validateCommand(command: string, args: string[]): { valid: boolean; error?: string } {
  const { PLAYGROUND_COMMANDS, CONFIG_KEYS } = require('./commands');

  const cmdMeta = PLAYGROUND_COMMANDS.find((c: { name: string }) => c.name === command);
  if (!cmdMeta) return { valid: false, error: `Command '${command}' not allowed in playground` };

  const allowedFlags = new Set(cmdMeta.flags.map((f: { name: string }) => f.name.split(' ')[0]));
  for (const arg of args) {
    if (arg.startsWith('--') || arg.startsWith('-')) {
      const flagName = arg.split('=')[0];
      if (!allowedFlags.has(flagName)) {
        return { valid: false, error: `Flag '${flagName}' not allowed for '${command}' in playground` };
      }
    }
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

export { getConcurrentSessions, incrementConcurrentSessions, decrementConcurrentSessions };
