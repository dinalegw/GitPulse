// Run metadata and idempotency store.
// Sandbox identity and execution NEVER depend on this module.

import { withOptionalStorageTimeout } from './optional-storage';
import { getRedis } from './redis';
import type { PlaygroundState } from './playground-state';
import { canTransition, isTerminal } from './playground-state';

const KV_RUN_PREFIX = 'playground:run:';
const KV_IDEMP_PREFIX = 'playground:idemp:';
const RUN_TTL_SECONDS = 60 * 60 * 2;

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

const memory: MemoryStore =
  (globalThis as { __gitpulseRunStore?: MemoryStore }).__gitpulseRunStore ?? {
    runs: new Map(),
    idemp: new Map(),
  };

if (!(globalThis as { __gitpulseRunStore?: MemoryStore }).__gitpulseRunStore) {
  (globalThis as { __gitpulseRunStore?: MemoryStore }).__gitpulseRunStore = memory;
}

function randomRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeIdempotencyKey(
  command: string,
  args: string[],
  key: string
): string {
  return `${command}|${args.join('\u0000')}|${key}`;
}

function buildRun(input: {
  sessionId: string;
  command: string;
  args: string[];
  idempotencyKey: string;
  ip?: string;
}, runId = randomRunId()): PlaygroundRun {
  const now = Date.now();
  return {
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
}

function rememberRun(run: PlaygroundRun, normalized?: string): void {
  memory.runs.set(run.runId, run);
  if (normalized) memory.idemp.set(normalized, run.runId);
}

async function persistRun(run: PlaygroundRun): Promise<void> {
  memory.runs.set(run.runId, run);
  const redis = getRedis();
  if (!redis) return;

  try {
    await withOptionalStorageTimeout(
      redis.set(`${KV_RUN_PREFIX}${run.runId}`, JSON.stringify(run), {
        ex: RUN_TTL_SECONDS,
      }),
      'run metadata write'
    );
  } catch (error) {
    console.warn('[runs] optional Redis write unavailable; continuing in memory:', error);
  }
}

export async function loadRun(runId: string): Promise<PlaygroundRun | null> {
  const local = memory.runs.get(runId);
  if (local) return local;

  const redis = getRedis();
  if (redis) {
    try {
      const raw = await withOptionalStorageTimeout(
        redis.get<string>(`${KV_RUN_PREFIX}${runId}`),
        'run metadata read'
      );
      if (typeof raw === 'string') {
        const run = JSON.parse(raw) as PlaygroundRun;
        memory.runs.set(runId, run);
        return run;
      }
    } catch (error) {
      console.warn('[runs] optional Redis read unavailable; using memory:', error);
    }
  }

  return null;
}

export async function findRunByIdempotencyKey(
  command: string,
  args: string[],
  idempotencyKey: string
): Promise<PlaygroundRun | null> {
  const normalized = normalizeIdempotencyKey(command, args, idempotencyKey);
  const localId = memory.idemp.get(normalized);
  if (localId) {
    const local = memory.runs.get(localId);
    if (local) return local;
  }

  const redis = getRedis();
  if (!redis) return null;

  try {
    const runId = await withOptionalStorageTimeout(
      redis.get<string>(`${KV_IDEMP_PREFIX}${normalized}`),
      'idempotency read'
    );
    if (!runId) return null;
    return await loadRun(runId);
  } catch (error) {
    console.warn('[runs] optional Redis idempotency read unavailable:', error);
    return null;
  }
}

export async function claimRun(input: {
  sessionId: string;
  command: string;
  args: string[];
  idempotencyKey: string;
  ip?: string;
}): Promise<{ run: PlaygroundRun; created: boolean }> {
  const normalized = normalizeIdempotencyKey(
    input.command,
    input.args,
    input.idempotencyKey
  );

  // Same-instance claim is synchronous.
  const localId = memory.idemp.get(normalized);
  if (localId) {
    const local = memory.runs.get(localId);
    if (local) return { run: local, created: false };
  }

  const candidate = buildRun(input);

  const redis = getRedis();
  if (redis) {
    try {
      // Redis SET NX is the distributed atomic claim. This is deliberately
      // not implemented as GET -> SET.
      const claimed = await withOptionalStorageTimeout(
        redis.set(`${KV_IDEMP_PREFIX}${normalized}`, candidate.runId, {
          nx: true,
          ex: RUN_TTL_SECONDS,
        }),
        'atomic idempotency claim'
      );

      if (!claimed) {
        const existingRunId = await withOptionalStorageTimeout(
          redis.get<string>(`${KV_IDEMP_PREFIX}${normalized}`),
          'idempotency winner read'
        );

        if (existingRunId) {
          const existing = await loadRun(existingRunId);
          if (existing) {
            rememberRun(existing, normalized);
            return { run: existing, created: false };
          }

          // The winning instance may not have persisted its run record yet.
          // A minimal QUEUED record is enough for the duplicate 409 response.
          const placeholder = buildRun(input, existingRunId);
          rememberRun(placeholder, normalized);
          return { run: placeholder, created: false };
        }
      } else {
        rememberRun(candidate, normalized);
        await persistRun(candidate);
        return { run: candidate, created: true };
      }
    } catch (error) {
      console.warn(
        '[runs] distributed idempotency unavailable; falling back to same-instance claim:',
        error
      );
    }
  }

  // Re-check after the optional async distributed claim attempt.
  const racedId = memory.idemp.get(normalized);
  if (racedId) {
    const raced = memory.runs.get(racedId);
    if (raced) return { run: raced, created: false };
  }

  rememberRun(candidate, normalized);
  await persistRun(candidate);
  return { run: candidate, created: true };
}

export async function createRun(input: {
  sessionId: string;
  command: string;
  args: string[];
  idempotencyKey: string;
  ip?: string;
}): Promise<PlaygroundRun> {
  const run = buildRun(input);
  const normalized = normalizeIdempotencyKey(
    input.command,
    input.args,
    input.idempotencyKey
  );
  rememberRun(run, normalized);
  await persistRun(run);
  return run;
}

export async function transitionState(
  runId: string,
  to: PlaygroundState,
  meta?: { exitCode?: number; errorMessage?: string }
): Promise<PlaygroundRun | null> {
  const run = await loadRun(runId);
  if (!run) return null;
  if (run.state === to) return run;

  if (!canTransition(run.state, to)) {
    console.warn(
      `[runs] refusing invalid transition ${run.state} -> ${to} for ${runId}`
    );
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
