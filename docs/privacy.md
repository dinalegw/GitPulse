# GitPulse Privacy

GitPulse is built privacy-by-design. This document describes what data the
hosted GitPulse website collects, why, how long it is retained, who can
access it, and how it is deleted.

The CLI is covered separately in [`SECURITY.md`](../SECURITY.md) and
[`docs/github-push.md`](github-push.md); it does not contact the hosted
platform at all and stores configuration only on the user's machine.

## TL;DR

- We do not store GitHub passwords, personal access tokens, SSH keys,
  OAuth client secrets, or repository contents.
- We store only the minimum identity summary returned by GitHub OAuth
  (user id, login, name, avatar, primary email).
- Sandbox execution data lives in short-lived caches and is deleted at
  most 24 hours after the run.
- Audit events are retained for 90 days, with secrets automatically
  redacted at write time.

## What we collect

| Data | Source | Why | Retention |
| --- | --- | --- | --- |
| GitHub user id, login, display name, avatar URL | GitHub OAuth `/user` | Identify you in our database | Account lifetime |
| Primary email address | GitHub OAuth `/user/emails` | Communicate about your account | Until you disconnect GitHub |
| Granted OAuth scopes | GitHub OAuth response header | Display what you approved | 8 hours (session) |
| GitHub installation ids | GitHub OAuth `/user/installations` | List repositories you can target | Until you disconnect GitHub |
| Playgrounds run ids, command, args, state, timing | Local session + rate limiter | Operate the playground, prevent abuse | 2 hours |
| Audit events | Server actions you take | Trace privileged operations | 90 days |
| Rate-limit counters | Per-IP | Prevent abuse | 1 hour rolling |

We do **not** collect:

- GitHub passwords
- Personal access tokens
- SSH private keys
- Repository contents
- The contents of any commits you push through GitPulse
- The body of GitHub API responses (only metadata we need)

## How data is stored

| Tier | Storage | Encryption | Lifetime |
| --- | --- | --- | --- |
| Session | Vercel KV (Upstash Redis) | Encrypted at rest by Upstash | 8 hours |
| Audit log | Vercel KV (Upstash Redis), 90-day TTL | Encrypted at rest by Upstash | 90 days |
| Playground run state | Vercel KV | Encrypted at rest | 2 hours |
| Rate-limit counters | Vercel KV | Encrypted at rest | 1 hour |
| Sandbox output | E2B microVM (ephemeral) | E2B-managed isolation | Disposed at session end |

In local development without KV, the platform falls back to an in-memory
store. The in-memory store is intentionally non-persistent and is
rebuilt on every function cold start. It never writes to disk.

## How secrets are handled

- Bearer tokens received from GitHub are used in-memory for the duration
  of one API call and are never written to KV or to disk.
- The hosted platform issues short-lived cookies (`HttpOnly`, `Secure`,
  `SameSite=Lax`) carrying only a random session id.
- Every audit event passes through a `redact()` function before being
  written. The function strips bearer tokens, credential-bearing URL
  userinfo, emails, and any object key whose name looks secret-like.
- We never log secrets ourselves, but if a future contributor adds a
  log line, it will be filtered by the redaction layer before reaching
  any storage backend.

## Deletion

- **Disconnect GitHub** — POST to `/api/auth/disconnect`. This deletes
  the local session record immediately and clears the cookie. The bearer
  token is not persisted so there is nothing else to remove. We also
  recommend revoking GitPulse on
  [github.com/settings/applications](https://github.com/settings/applications).
- **Account deletion** — POST to `/api/account/delete` (planned; not yet
  shipped). This removes the user record and cascades to workspaces,
  subscriptions, runs, and audit events.
- **Sandbox data** — disposable by design; the sandbox is destroyed at
  the end of the session and is never persisted to durable storage.

## What we do *not* promise

- We do not promise that every successful `git push` produces a GitHub
  contribution square. Contribution attribution is decided by GitHub
  using the author email; that is outside our control.
- We do not promise 100% privacy. If GitHub itself is compromised, our
  user-id-to-login mapping is disclosed.
- We do not promise that the hosted platform will remain free in the
  future. Pricing decisions live in [`docs/monetization.md`](monetization.md).