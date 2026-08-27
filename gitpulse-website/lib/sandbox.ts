// E2B Sandbox client wrapper for GitPulse playground
// Handles sandbox lifecycle, command execution, and I/O streaming

import { Sandbox } from '@e2b/code-interpreter';

export interface SandboxSession {
  sandboxId: string;
  sandbox: Sandbox;
  createdAt: number;
  command: string;
  args: string[];
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
  const sandbox = await Sandbox.create({
    apiKey: E2B_API_KEY,
    template: E2B_TEMPLATE_ID || undefined,
    timeoutMs: MAX_SESSION_SECONDS * 1000,
  });

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
 * Execute a GitPulse command in the sandbox and return output
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
 * Send stdin to a running sandbox process (for interactive commands)
 */
export async function sendStdin(sessionId: string, input: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // Note: E2B's SDK doesn't directly support stdin to a running process
  // For interactive mode, we'd need to use the terminal/pty API
  // This is a placeholder for the full implementation
  console.log(`[Sandbox] Stdin for ${sessionId}: ${input}`);
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
  const { PLAYGROUND_COMMANDS } = require('./commands');

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
      const { CONFIG_KEYS } = require('./commands');
      if (!CONFIG_KEYS.includes(key as any)) {
        return { valid: false, error: `Invalid config key: ${key}` };
      }
    }
  }

  return { valid: true };
}