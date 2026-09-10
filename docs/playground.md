# Playground Architecture

The public `/playground` page runs the real GitPulse binary in a new disposable Vercel Sandbox. It is an evaluation environment, not a hosted runner for a user's GitHub repository.

## Request flow

```text
Browser
  -> POST /api/playground/run
  -> validate command and arguments
  -> apply per-IP rate and concurrency limits
  -> claim an idempotency key
  -> create one Vercel Sandbox
  -> build or verify GitPulse runtime
  -> create a demo Git repository and local fake origin
  -> stream NDJSON state/output events
  -> delete the sandbox in finally
```

The frontend renders the NDJSON stream in a terminal-style component. Interactive stdin is deliberately disabled; `/api/playground/input` returns HTTP 410.

## Safety boundaries

- Only commands and flags accepted by `lib/playground-policy.js` may run.
- Schedule/daemon modes and unsafe or resource-heavy arguments are rejected.
- Git credential helpers and prompts are disabled.
- `GH_TOKEN`, `GITHUB_TOKEN`, and `GIT_ASKPASS` are explicitly empty.
- The remote named `origin` is a bare repository inside the same sandbox, never GitHub.
- Captured stdout and stderr are bounded to 256 KiB.
- A fresh sandbox is created for every accepted run and deleted in a `finally` path.
- Cold bootstrap downloads Go and public GitPulse source, validates the Go archive checksum, and does not receive application secrets.

## State and idempotency

The lifecycle is represented by `lib/playground-state.ts`:

```text
QUEUED -> STARTING -> RUNNING -> result -> CLEANUP -> DISPOSED
```

Explicit failure states cover start failures, command failures, timeouts, cancellation, and cleanup failures. A client-generated idempotency key prevents duplicate execution on the same process; optional Upstash Redis provides an atomic cross-instance claim. Without Redis, duplicate protection and rate limits are best-effort per serverless instance.

“Run Again” creates a new idempotency key and a fresh sandbox. No filesystem is shared with the previous run.

## Limits

| Resource | Current limit |
| --- | --- |
| Command execution | `PLAYGROUND_MAX_SECONDS`, clamped to 30–240 seconds; default 60 |
| Function duration | 300 seconds in `vercel.json` |
| Sandbox lifetime | execution window plus bounded startup/cleanup grace |
| Captured output | 256 KiB |
| Concurrent runs per client IP | configurable; default 3 |
| Requests | configurable per-minute and per-hour limits |

Keep `PLAYGROUND_MAX_SECONDS` at or below the function duration available to the deployed Vercel plan. The 240-second maximum leaves bounded startup and cleanup time inside the configured 300-second function duration.

## Optional metadata and cleanup

Run/audit/rate metadata uses optional Upstash Redis and falls back to memory. Sandbox execution itself does not depend on Redis. The run route always attempts sandbox deletion; `/api/cron/cleanup` cleans stale metadata records when Vercel Cron and `CRON_SECRET` are configured, but it does not reconnect to or control a sandbox.
