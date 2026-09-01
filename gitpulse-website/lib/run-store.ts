// Run record store. Tracks every playground execution with an explicit
// state machine. Two responsibilities:
//
//   1. Idempotency. A double-clicked Run / Run Again with the same
//      client-provided idempotency key returns the SAME execution id and
//      never spins up two sandboxes. This is the core defense against
//      "user clicked twice".
//
//   2. Visibility. The frontend can fetch the current state of any
//      execution by id. The state machine guarantees there are no
//      ambiguous transitions.
//
// Backed by Vercel KV in production; in-memory Map in local dev. The
// Map is intentionally non-persistent.

import { kv } from '@vercel/kv';
import type { PlaygroundState } from './playground-state';
import { canTransition, isTerminal } from './playground-state';

const KV_RUN_PREFIX = 'playground:run:';
const KV_IDEMP_PREFIX = 'playground:idemp:';
const RUN_TTL_SECONDS = 60 * 60 * 2; // 2 hours, matches max session window

export interface PlaygroundRun {
  runId: string;
  sessionId: string;
  idempotencyKey: string;
  command: string;
  args: string[];
  state: PlaygroundState;
  stateHistory: Array<{ state: PlaygroundState; at: number }>;
  createdAt: number;
  updatedAt: number;
  exitCode?: number;
  errorMessage?: string;
  ip?: string;
}

interface MemoryStore {
  runs: Map<string, PlaygroundRun>;
  idemp: Map<string, string>;
}
const memory: MemoryStore = (globalThis as { __gitpulseRunStore?: MemoryStore }).__gitpulseRunStore ?? {
  runs: new Map(),
  idemp: new Map(),
};
if (!(globalThis as { __gitpulseRunStore?: MemoryStore }).__gitpulseRunStore) {
  (globalThis as { __gitpulseRunStore?: MemoryStore }).__gitpulseRunStore = memory;
}

function kvAvailable(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function randomRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeIdempotencyKey(command: string, args: string[], key: string): string {
  // The key already encodes the client request. We additionally bind it to
  // the (command, args) tuple so a key from one command cannot collide
  // with another command.
  return `${command}|${args.join('\u0000')}|${key}`;
}

export async function findRunByIdempotencyKey(
  command: string,
  args: string[],
  idempotencyKey: string,
): Promise<PlaygroundRun | null> {
  const normalized = normalizeIdempotencyKey(command, args, idempotencyKey);
  if (kvAvailable()) {
    try {
      const runId = await kv.get<string>(`${KV_IDEMP_PREFIX}${normalized}`);
      if (runId) {
        return await loadRun(runId);
      }
      return null;
    } catch (error) {
      console.warn('[runs] KV read failed, falling back to memory:', error);
    }
  }
  const runId = memory.idemp.get(normalized);
  if (!runId) return null;
  return memory.runs.get(runId) ?? null;
}

export async function createRun(input: {
  sessionId: string;
  command: string;
  args: string[];
  idempotencyKey: string;
  ip?: string;
}): Promise<PlaygroundRun> {
  const runId = randomRunId();
  const now = Date.now();
  const run: PlaygroundRun = {
    runId,
    sessionId: input.sessionId,
    idempotencyKey: input.idempotencyKey,
    command: input.command,
    args: input.args,
    state: 'QUEUED',
    stateHistory: [{ state: 'QUEUED', at: now }],
    createdAt: now,
    updatedAt: now,
    ip: input.ip,
  };
  await persistRun(run);
  const normalized = normalizeIdempotencyKey(input.command, input.args, input.idempotencyKey);
  if (kvAvailable()) {
    try {
      await kv.set(`${KV_IDEMP_PREFIX}${normalized}`, runId, { ex: RUN_TTL_SECONDS });
    } catch {
      // Persist failure: fall through to memory only.
    }
  }
  memory.idemp.set(normalized, runId);
  return run;
}

export async function loadRun(runId: string): Promise<PlaygroundRun | null> {
  if (kvAvailable()) {
    try {
      const raw = await kv.get<string>(`${KV_RUN_PREFIX}${runId}`);
      if (raw) return JSON.parse(raw) as PlaygroundRun;
    } catch {
      // Fall through.
    }
  }
  return memory.runs.get(runId) ?? null;
}

async function persistRun(run: PlaygroundRun): Promise<void> {
  if (kvAvailable()) {
    try {
      await kv.set(`${KV_RUN_PREFIX}${run.runId}`, JSON.stringify(run), { ex: RUN_TTL_SECONDS });
    } catch (error) {
      console.warn('[runs] KV write failed, falling back to memory:', error);
    }
  }
  memory.runs.set(run.runId, run);
}

export async function transitionState(runId: string, to: PlaygroundState, meta?: { exitCode?: number; errorMessage?: string }): Promise<PlaygroundRun | null> {
  const run = await loadRun(runId);
  if (!run) return null;
  if (run.state === to) return run;
  if (!canTransition(run.state, to)) {
    console.warn(`[runs] refusing invalid transition ${run.state} -> ${to} for ${runId}`);
    return run;
  }
  run.state = to;
  run.updatedAt = Date.now();
  run.stateHistory.push({ state: to, at: run.updatedAt });
  if (typeof meta?.exitCode === 'number') run.exitCode = meta.exitCode;
  if (meta?.errorMessage) run.errorMessage = meta.errorMessage;
  await persistRun(run);
  return run;
}

// cleanupStuckRuns finds runs whose state is non-terminal but whose
// updatedAt is older than maxAgeMs and forces them through CLEANUP -> DISPOSED.
// This is the orphan-sandbox sweeper. Idempotent.
export async function cleanupStuckRuns(maxAgeMs: number): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  let cleaned = 0;
  for (const run of memory.runs.values()) {
    if (isTerminal(run.state)) continue;
    if (run.updatedAt >= cutoff) continue;
    await transitionState(run.runId, 'CLEANUP');
    await transitionState(run.runId, 'DISPOSED');
    cleaned++;
  }
  return cleaned;
}