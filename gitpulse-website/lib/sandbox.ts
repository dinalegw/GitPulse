// E2B Sandbox client wrapper for GitPulse playground
// Handles sandbox lifecycle, command execution, and I/O streaming

import { Sandbox } from '@e2b/code-interpreter';

export interface SandboxSession {
  sandboxId: string;
  sandbox: Sandbox;
  createdAt: number;
  command: string;
  args: string[];
  ptyPid?: number; // E2B PTY process ID for interactive mode
}

const sessions = new Map<string, SandboxSession>();

const E2B_API_KEY = process.env.E2B_API_KEY;
const E2B_TEMPLATE_ID = process.env.E2B_TEMPLATE_ID;
const MAX_SESSION_SECONDS = parseInt(process.env.PLAYGROUND_MAX_SECONDS || '60', 10);

if (!E2B_API_KEY) {
  console.warn('[Sandbox] E2B_API_KEY not set — playground will not work');
}

if (!E2B_TEMPLATE_ID) {
  console.warn('[Sandbox] E2B_TEMPLATE_ID not set — using default template (slower boot)');
}

/**
 * Create a new sandbox session for a playground command
 */
export async function createSandboxSession(
  sessionId: string,
  command: string,
  args: string[]
): Promise<SandboxSession> {
  if (!E2B_API_KEY) {
    throw new Error('E2B_API_KEY not configured');
  }

  // Create sandbox with pre-baked template (has git + gitpulse pre-installed)
  // In E2B v1.5.1, template is passed as first positional argument if provided
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
    sandboxId: sessionId,
    sandbox,
    createdAt: Date.now(),
    command,
    args,
  };

  sessions.set(sessionId, session);

  // Auto-cleanup after timeout
  setTimeout(() => {
    cleanupSession(sessionId);
  }, MAX_SESSION_SECONDS * 1000);

  return session;
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
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const { sandbox } = session;

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
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const { sandbox } = session;

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

  session.ptyPid = ptyHandle.pid;

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
    }
  })();

  // Note: The PTY is now running with the command. Call sendStdin() to write more input.
}

/**
 * Send stdin to a running interactive process in the sandbox
 */
export async function sendStdin(sessionId: string, input: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (!session.ptyPid) {
    throw new Error('No interactive process running');
  }

  // Write to the PTY stdin using E2B's sendInput
  const encoder = new TextEncoder();
  await session.sandbox.pty.sendInput(session.ptyPid, encoder.encode(input));
}

/**
 * Resize the PTY (for terminal resize events)
 */
export async function resizePTY(sessionId: string, cols: number, rows: number): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session || !session.ptyPid) {
    return;
  }

  await session.sandbox.pty.resize(session.ptyPid, { cols, rows });
}

/**
 * Kill the running interactive process
 */
export async function killProcess(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session || !session.ptyPid) {
    return;
  }

  try {
    await session.sandbox.pty.kill(session.ptyPid);
  } catch (e) {
    console.error(`[Sandbox] Error killing process:`, e);
  }
  session.ptyPid = undefined;
}

/**
 * Get session info
 */
export function getSession(sessionId: string): SandboxSession | undefined {
  return sessions.get(sessionId);
}

/**
 * Clean up a sandbox session
 */
export async function cleanupSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (session) {
    // Kill any running PTY first
    if (session.ptyPid) {
      try {
        await session.sandbox.pty.kill(session.ptyPid);
      } catch (e) {
        console.error(`[Sandbox] Error killing PTY:`, e);
      }
    }
    try {
      await session.sandbox.kill();
      console.log(`[Sandbox] Cleaned up session ${sessionId}`);
    } catch (e) {
      console.error(`[Sandbox] Error cleaning up ${sessionId}:`, e);
    }
    sessions.delete(sessionId);
  }
}

/**
 * Clean up all expired sessions
 */
export function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > MAX_SESSION_SECONDS * 1000) {
      cleanupSession(id);
    }
  }
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