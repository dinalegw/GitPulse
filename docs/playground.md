# Playground Architecture

The playground at `/playground` lets a user run the real `gitpulse`
binary in an ephemeral, isolated microVM without installing anything.

## Goals

- Allow prospective users to evaluate GitPulse with zero install.
- Keep the playground safe even if the executed code is hostile.
- Make "Run Again" deterministic: each click is a brand-new sandbox;
  previous sandboxes do not leak state.

## Architecture

```text
Browser (xterm.js)
   ↑ SSE / fetch
   │
Next.js API route (/api/playground/run)
   │
   ├── rate limit (Vercel KV)
   ├── command allow-list (lib/commands.ts)
   ├── idempotency key (client-supplied UUID)
   ├── state machine (lib/playground-state.ts)
   ├── audit log (lib/audit-log.ts)
   │
   └── E2B sandbox
         ├── fresh container per session
         ├── /home/user/scratch-repo with git config
         ├── /tmp/fake-origin bare repo as "origin"
         └── gitpulse binary (pre-installed template or first-boot install)
```

Each component is described below.

## Disposable sandbox lifecycle

```text
QUEUED         (HTTP request received)
   ↓
STARTING       (E2B.create + setup scratch repo)
   ↓
RUNNING        (PTY executing the command)
   ↓
SUCCEEDED ──→ CLEANUP ──→ DISPOSED
FAILED   ──→ CLEANUP ──→ DISPOSED
TIMED_OUT──→ CLEANUP ──→ DISPOSED
CANCELLED──→ CLEANUP ──→ DISPOSED
START_FAILED──→CLEANUP ──→ DISPOSED
```

`lib/playground-state.ts` is the single source of truth for these
transitions. Both the API and the frontend import the same definitions
so they cannot drift.

Every terminal state must allow `CLEANUP → DISPOSED` because the sandbox
must always be killed, even after a successful command.

## "Run Again" semantics

When the user clicks "Run Again":

1. The frontend generates a fresh idempotency key.
2. The frontend sends a fresh `sessionId`.
3. The backend creates a brand-new run record; the previous run record
   stays in history.
4. A brand-new sandbox is created. There is no shared state with the
   previous run.

This guarantees that:

- Two simultaneous "Run Again" clicks produce only one execution.
- A previous failure cannot contaminate a new execution.
- The user can scroll back through the full run history.

## Resource limits

Each sandbox enforces the following limits:

| Resource | Limit | Source |
| --- | --- | --- |
| Execution time | 60 seconds | `PLAYGROUND_MAX_SECONDS` env var |
| Sandbox lifetime | Matches execution timeout + grace | E2B |
| Output size | Bounded by streaming connection | SSE |
| Filesystem size | E2B template default | E2B |
| Network egress | None (sandbox is air-gapped) | E2B + sandbox setup |
| Process count | Single PTY | xterm.js + sandbox setup |

The frontend watchdog (`setTimeout(maxMs + 2000)`) guarantees the API
marks the run as `TIMED_OUT` even if E2B's timeout is silent.

## Idempotency

The frontend sends an `idempotencyKey` (UUID) with each request. The
backend normalizes it as:

```text
normalize(command, args, idempotencyKey)
  → `${command}|${args.join('\u0000')}|${idempotencyKey}`
```

If a second request arrives with the same triple while the first is
still in flight or completed, the backend returns the existing run id
and the client is expected to reuse it. This is the core defense
against double-clicks.

## Orphan cleanup

A scheduled endpoint (`/api/cron/cleanup`) sweeps the run store every
minute (when wired up to Vercel Cron). It:

1. Authenticates with `CRON_SECRET` to prevent public invocation.
2. Calls `cleanupStuckRuns(5 * 60 * 1000)` which transitions any
   non-terminal run older than 5 minutes through `CLEANUP → DISPOSED`.
3. Writes an audit event recording the number of runs cleaned.

In environments without a cron, the `setTimeout` auto-cleanup at the
end of `createSandboxSession` (60s) provides best-effort coverage; the
KV TTL on the run record ensures eventual consistency even if both
mechanisms fail.

## Command allow-list

`lib/commands.ts` is the single source of truth for which commands and
flags the playground accepts. Adding a new command means:

1. Adding an entry to the `COMMANDS` array with `playground.allowed: true`.
2. Listing every flag the playground should permit.
3. Re-running the docs generation.

Anything outside the allow-list is rejected with HTTP 400 before the
sandbox is even created.

## Audit log

The playground writes the following audit events:

- `playground_run_created` — when a run is accepted
- `playground_run_start_failed` — when sandbox creation fails
- `playground_orphan_cleanup` — when the cron sweeper runs

All events are passed through the redaction filter before being written
to KV. No sandbox output is ever written to the audit log.

## Security posture

The playground sandboxes run in E2B microVMs which provide:

- Process isolation (the host filesystem is not reachable from the sandbox)
- No persistent storage between sessions
- Network isolation (the sandbox cannot reach the public internet; the
  setup script installs gitpulse via E2B's pre-baked template or via
  `go install` if no template is configured)
- A scratch git repo with a local bare repo as the "origin" — no
  real GitHub credentials are ever introduced

The sandbox environment has no access to:

- The user's GitHub token
- The user's home directory
- Any other user's sandbox
- Production database credentials
- The platform's GitHub App credentials

## What the playground is *not*

- It is not a hosted job runner. It does not create persistent
  scheduled jobs. That is the hosted platform's job (out of scope for
  this repository).
- It is not authenticated by default. Anyone with network access to
  the site can run the playground. This is intentional — it lowers
  the barrier to evaluation. Rate limiting protects against abuse.