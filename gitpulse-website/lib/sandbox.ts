// E2B Sandbox client wrapper for GitPulse playground
// Handles sandbox lifecycle, command execution, and I/O streaming
// Session state is persisted in Vercel KV (Upstash Redis) to survive
// Vercel serverless function cold starts and multi-instance deployments.

import { Sandbox } from '@e2b/code-interpreter';
import { kv } from '@vercel/kv';

export interface SandboxSession {
  sandboxId: string;
  createdAt: number;
  command: string;
  args: string[];
  ptyPid?: number; // E2B PTY process ID for interactive mode
}

const E2B_API_KEY = process.env.E2B_API_KEY;
const E2B_TEMPLATE_ID = process.env.E2B_TEMPLATE_ID;
const MAX_SESSION_SECONDS = parseInt(process.env.PLAYGROUND_MAX_SECONDS || '60', 10);
const KV_SESSION_PREFIX = 'playground:session:';
const KV_CONCURRENT_PREFIX = 'playground:concurrent:';

if (!E2B_API_KEY) {
  console.warn('[Sandbox] E2B_API_KEY not set — playground will not work');
}

if (!E2B_TEMPLATE_ID) {
  console.warn('[Sandbox] E2B_TEMPLATE_ID not set — using default template (slower boot)');
}

/**
 * Persist session metadata to Vercel KV
 */
async function saveSessionToKV(sessionId: string, session: Omit<SandboxSession, 'sandbox'>): Promise<void> {
  try {
    await kv.set(
      `${KV_SESSION_PREFIX}${sessionId}`,
      JSON.stringify(session),
      { ex: MAX_SESSION_SECONDS + 10 } // Expire slightly after max session time
    );
  } catch (error) {
    console.error('[Sandbox] Failed to save session to KV:', error);
    // Don't throw - fail open for session persistence
  }
}

/**
 * Load session metadata from Vercel KV
 */
async function loadSessionFromKV(sessionId: string): Promise<Omit<SandboxSession, 'sandbox'> | null> {
  try {
    const data = await kv.get<string>(`${KV_SESSION_PREFIX}${sessionId}`);
    if (data) {
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('[Sandbox] Failed to load session from KV:', error);
    return null;
  }
}

/**
 * Delete session from Vercel KV
 */
async function deleteSessionFromKV(sessionId: string): Promise<void> {
  try {
    await kv.del(`${KV_SESSION_PREFIX}${sessionId}`);
  } catch (error) {
    console.error('[Sandbox] Failed to delete session from KV:', error);
  }
}

/**
 * Increment concurrent session count for an IP
 */
async function incrementConcurrentSessions(ip: string): Promise<number> {
  try {
    const key = `${KV_CONCURRENT_PREFIX}${ip}`;
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.expire(key, MAX_SESSION_SECONDS * 2); // Expire after 2x max session
    }
    return count;
  } catch (error) {
    console.error('[Sandbox] Failed to increment concurrent sessions:', error);
    return 1; // Fail open
  }
}

/**
 * Decrement concurrent session count for an IP
 */
async function decrementConcurrentSessions(ip: string): Promise<void> {
  try {
    const key = `${KV_CONCURRENT_PREFIX}${ip}`;
    await kv.decr(key);
  } catch (error) {
    console.error('[Sandbox] Failed to decrement concurrent sessions:', error);
  }
}

/**
 * Get current concurrent session count for an IP
 */
async function getConcurrentSessions(ip: string): Promise<number> {
  try {
    const key = `${KV_CONCURRENT_PREFIX}${ip}`;
    const count = await kv.get<number>(key);
    return count || 0;
  } catch (error) {
    console.error('[Sandbox] Failed to get concurrent sessions:', error);
    return 0;
  }
}

/**
 * Create a new sandbox session for a playground command
 * Persists session metadata to KV for cross-instance recovery
 */
export async function createSandboxSession(
  sessionId: string,
  command: string,
  args: string[],
  clientIp?: string
): Promise<SandboxSession> {
  if (!E2B_API_KEY) {
    throw new Error('E2B_API_KEY not configured');
  }

  // Check concurrent session limit if IP provided
  if (clientIp) {
    const concurrent = await getConcurrentSessions(clientIp);
    const maxConcurrent = parseInt(process.env.PLAYGROUND_MAX_CONCURRENT_PER_IP || '3', 10);
    if (concurrent >= maxConcurrent) {
      throw new Error(`Too many concurrent sessions (max ${maxConcurrent}). Please wait for one to complete.`);
    }
    await incrementConcurrentSessions(clientIp);
  }

  // Create sandbox with pre-baked template (has git + gitpulse pre-installed)
  let sandbox: Sandbox;
  if (E2B_TEMPLATE_ID) {
    sandbox = await Sandbox.create(E2B_TEMPLATE_ID, {
      apiKey: E2B_API_KEY,
      timeoutMs: MAX_SESSION_SECONDS * 1000,
    });
  } else {
    sandbox = await Sandbox.create({
      apiKey: E2B_API_KEY,
      timeoutMs: MAX_SESSION_SECONDS * 1000,
    });
  }

  // Set up the scratch repository and fake origin
  await setupScratchRepo(sandbox);

  const session: SandboxSession = {
    sandboxId: sandbox.sandboxId,
    createdAt: Date.now(),
    command,
    args,
  };

  // Persist to KV
  await saveSessionToKV(sessionId, session);

  // Auto-cleanup after timeout
  setTimeout(() => {
    cleanupSession(sessionId, clientIp).catch(console.error);
  }, MAX_SESSION_SECONDS * 1000);

  return session;
}

/**
 * Reconnect to an existing sandbox using persisted session metadata
 * Used by /api/playground/input to resume interactive sessions
 */
export async function reconnectSandboxSession(sessionId: string): Promise<{ sandbox: Sandbox; session: SandboxSession } | null> {
  if (!E2B_API_KEY) {
    throw new Error('E2B_API_KEY not configured');
  }

  const sessionMeta = await loadSessionFromKV(sessionId);
  if (!sessionMeta) {
    return null;
  }

  // Reconnect to existing sandbox by ID
  const sandbox = await Sandbox.connect(sessionMeta.sandboxId, {
    apiKey: E2B_API_KEY,
  });

  const session: SandboxSession = {
    ...sessionMeta,
    sandboxId: sandbox.sandboxId,
  };

  return { sandbox, session };
}

/**
 * Set up a scratch git repo with a local bare repo as "origin"
 */
async function setupScratchRepo(sandbox: Sandbox): Promise<void> {
  const setupCommands = [
    // Create working directory
    'mkdir -p /home/user/scratch-repo && cd /home/user/scratch-repo',
    // Initialize git repo
    'git init',
    'git config user.email "playground@gitpulse.dev"',
    'git config user.name "GitPulse Playground"',
    // Create initial commit
    'echo "# Scratch Repository" > README.md',
    'git add README.md',
    'git commit -m "Initial commit"',
    // Create local bare repo as "origin"
    'git init --bare /tmp/fake-origin',
    'git remote add origin /tmp/fake-origin',
    'git push -u origin main',
    // Verify setup
    'git status',
    'git log --oneline -1',
  ];

  for (const cmd of setupCommands) {
    await sandbox.commands.run(cmd, { timeoutMs: 10000 });
  }

  // Install GitPulse if not in template
  try {
    await sandbox.commands.run('which gitpulse', { timeoutMs: 5000 });
  } catch {
    console.log('[Sandbox] Installing GitPulse in sandbox...');
    await sandbox.commands.run(
      'go install github.com/dinalegw/GitPulse@latest',
      { timeoutMs: 120000 }
    );
    // Add to PATH
    await sandbox.commands.run('export PATH=$PATH:$(go env GOPATH)/bin', { timeoutMs: 5000 });
  }
}

/**
 * Execute a GitPulse command in the sandbox and return output (non-interactive)
 */
export async function executeCommand(
  sessionId: string,
  command: string,
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const reconnected = await reconnectSandboxSession(sessionId);
  if (!reconnected) {
    throw new Error('Session not found or expired');
  }

  const { sandbox } = reconnected;

  // Build the gitpulse command
  const gpArgs = args.join(' ');
  const fullCommand = `cd /home/user/scratch-repo && gitpulse ${command} ${gpArgs}`;

  console.log(`[Sandbox] Executing: ${fullCommand}`);

  const result = await sandbox.commands.run(fullCommand, {
    timeoutMs: MAX_SESSION_SECONDS * 1000,
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/**
 * Start an interactive process in the sandbox and return a handle for streaming I/O
 * Uses E2B's PTY API (sandbox.pty.create) for true interactive terminal support
 * The PTY is created as a raw terminal, then we send the command as input
 */
export async function startInteractiveProcess(
  sessionId: string,
  command: string,
  args: string[],
  onStdout: (data: string) => void,
  onStderr: (data: string) => void,
  onExit: (exitCode: number) => void
): Promise<void> {
  const reconnected = await reconnectSandboxSession(sessionId);
  if (!reconnected) {
    throw new Error('Session not found or expired');
  }

  const { sandbox, session } = reconnected;

  // Build the gitpulse command
  const gpArgs = args.join(' ');
  const fullCommand = `cd /home/user/scratch-repo && gitpulse ${command} ${gpArgs}\n`;

  console.log(`[Sandbox] Starting interactive: ${fullCommand.trim()}`);

  // Use E2B's PTY API for bidirectional interactive terminal
  // Get initial terminal size from environment or default to 80x24
  const cols = parseInt(process.env.TERMINAL_COLS || '80', 10);
  const rows = parseInt(process.env.TERMINAL_ROWS || '24', 10);

  // Create PTY - returns CommandHandle which we can wait on for exit
  const ptyHandle = await sandbox.pty.create({
    cols,
    rows,
    // onData callback receives Uint8Array - PTY combines stdout and stderr
    onData: (data: Uint8Array) => {
      const text = new TextDecoder().decode(data);
      onStdout(text);
    },
    envs: {},
    cwd: '/home/user/scratch-repo',
    timeoutMs: MAX_SESSION_SECONDS * 1000,
  });

  // Update session with PTY pid and persist
  session.ptyPid = ptyHandle.pid;
  await saveSessionToKV(sessionId, session);

  // Send the command to the PTY as input
  const encoder = new TextEncoder();
  await sandbox.pty.sendInput(ptyHandle.pid, encoder.encode(fullCommand));

  // Wait for exit in background and call onExit callback
  (async () => {
    try {
      const result = await ptyHandle.wait();
      onExit(result.exitCode);
    } catch (e) {
      // If wait throws, try to get exitCode from handle
      const exitCode = ptyHandle.exitCode ?? 1;
      onExit(exitCode);
    } finally {
      session.ptyPid = undefined;
      await saveSessionToKV(sessionId, session);
    }
  })();

  // Note: The PTY is now running with the command. Call sendStdin() to write more input.
}

/**
 * Send stdin to a running interactive process in the sandbox
 * Reconnects to sandbox if needed, then sends input to PTY
 */
export async function sendStdin(sessionId: string, input: string): Promise<void> {
  const reconnected = await reconnectSandboxSession(sessionId);
  if (!reconnected) {
    throw new Error('Session not found or expired');
  }

  const { sandbox, session } = reconnected;
  const ptyPid = session.ptyPid;

  if (!ptyPid) {
    throw new Error('No interactive process running');
  }

  // Write to the PTY stdin using E2B's sendInput
  const encoder = new TextEncoder();
  await sandbox.pty.sendInput(ptyPid!, encoder.encode(input)); // non-null asserted by guard above
}

/**
 * Resize the PTY (for terminal resize events)
 * Reconnects to sandbox if needed
 */
export async function resizePTY(sessionId: string, cols: number, rows: number): Promise<void> {
  const reconnected = await reconnectSandboxSession(sessionId);
  if (!reconnected || !reconnected.session.ptyPid) {
    return;
  }

  const { sandbox, session } = reconnected;
  const ptyPid = session.ptyPid!; // non-null asserted by guard above

  await sandbox.pty.resize(ptyPid, { cols, rows });
}

/**
 * Kill the running interactive process
 */
export async function killProcess(sessionId: string): Promise<void> {
  const reconnected = await reconnectSandboxSession(sessionId);
  if (!reconnected || !reconnected.session.ptyPid) {
    return;
  }

  const { sandbox, session } = reconnected;
  const ptyPid = session.ptyPid!; // non-null asserted by guard above

  try {
    await sandbox.pty.kill(ptyPid);
  } catch (e) {
    console.error(`[Sandbox] Error killing process:`, e);
  }
  session.ptyPid = undefined;
  await saveSessionToKV(sessionId, session);
}

/**
 * Get session info from KV
 */
export async function getSession(sessionId: string): Promise<SandboxSession | null> {
  const sessionMeta = await loadSessionFromKV(sessionId);
  return sessionMeta || null;
}

/**
 * Clean up a sandbox session
 * Decrements concurrent session counter if IP provided
 */
export async function cleanupSession(sessionId: string, clientIp?: string): Promise<void> {
  const reconnected = await reconnectSandboxSession(sessionId);
  if (reconnected) {
    const { sandbox, session } = reconnected;
    // Kill any running PTY first
    if (session.ptyPid) {
      try {
        await sandbox.pty.kill(session.ptyPid);
      } catch (e) {
        console.error(`[Sandbox] Error killing PTY:`, e);
      }
    }
    try {
      await sandbox.kill();
      console.log(`[Sandbox] Cleaned up session ${sessionId}`);
    } catch (e) {
      console.error(`[Sandbox] Error cleaning up ${sessionId}:`, e);
    }
  }
  await deleteSessionFromKV(sessionId);

  if (clientIp) {
    await decrementConcurrentSessions(clientIp);
  }
}

/**
 * Clean up all expired sessions
 * Note: KV TTL handles expiration automatically, this is for manual cleanup if needed
 */
export async function cleanupExpiredSessions(): Promise<void> {
  // KV handles TTL-based expiration automatically
  // This function is kept for compatibility but does nothing
  console.log('[Sandbox] KV handles session expiration automatically via TTL');
}

/**
 * Validate command against allow-list
 */
export function validateCommand(command: string, args: string[]): { valid: boolean; error?: string } {
  // Import dynamically to avoid circular deps
  const { PLAYGROUND_COMMANDS, CONFIG_KEYS } = require('./commands');

  const cmdMeta = PLAYGROUND_COMMANDS.find((c: { name: string }) => c.name === command);
  if (!cmdMeta) {
    return { valid: false, error: `Command '${command}' not allowed in playground` };
  }

  // Validate flags against allow-list
  const allowedFlags = new Set(cmdMeta.flags.map((f: { name: string }) => f.name.split(' ')[0]));

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--') || arg.startsWith('-')) {
      const flagName = arg.split('=')[0];
      if (!allowedFlags.has(flagName)) {
        // Special handling for config set which takes key value
        if (command === 'config' && arg === 'set') {
          // Allow set subcommand, next two args are key and value
          continue;
        }
        return { valid: false, error: `Flag '${flagName}' not allowed for '${command}' in playground` };
      }
    }
  }

  // Validate config set key if present
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

// Export concurrent session helpers for use in rate-limit.ts
export { getConcurrentSessions, incrementConcurrentSessions, decrementConcurrentSessions };