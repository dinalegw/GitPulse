# GitPulse Privacy

This document describes the behavior currently implemented by the public website and CLI. Roadmap types in `gitpulse-website/lib/domain.ts` are not evidence of a shipped account database.

## Local CLI

The CLI runs locally and does not contact the GitPulse website for its core operation. Its configuration and logs stay on the user's machine. Git authentication is handled by the user's existing local Git setup.

## Website data

| Data | Purpose | Storage and lifetime |
| --- | --- | --- |
| GitHub id, login, name, avatar URL, returned scope metadata, installation ids | Show the connected identity and installation count | Encrypted HttpOnly browser cookie, up to 8 hours |
| OAuth state | Prevent cross-site request forgery during sign-in | HttpOnly browser cookie, up to 10 minutes |
| Playground run metadata: ids, command, arguments, state, timing, client IP | Idempotency, debugging, cleanup, and abuse prevention | Optional Upstash Redis for up to 2 hours; otherwise process memory |
| Rate-limit counters keyed by client IP | Abuse prevention | Optional Upstash Redis with short TTL; otherwise process memory |
| Redacted audit metadata | Operational troubleshooting | Optional Upstash Redis with configured TTL; otherwise process memory |
| Command output | Display the playground result | Streamed to the browser and bounded to 256 KiB; not written to the run or audit store |

The GitHub user access token exists only during the callback requests to `/user` and `/user/installations`, then is discarded. The website does not call `/user/emails` and does not persist a GitHub password, personal access token, SSH key, OAuth token, or repository contents.

The playground creates a disposable Vercel Sandbox with no GitHub credentials. It operates on a generated demo repository backed by a local fake origin. The sandbox is deleted in a `finally` cleanup path. It may access the public internet during cold bootstrap to download checksum-verified Go and GitPulse source; it is not described as air-gapped.

## Optional storage

`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` enable distributed metadata, audit, and rate-limit storage. Legacy `KV_REST_API_URL` and `KV_REST_API_TOKEN` names remain accepted during migration. Authentication sessions do not depend on Redis. Without Redis, these features fall back to per-process memory and are not consistent across serverless instances.

## Sign-out and revocation

Posting to `/api/auth/disconnect` clears the encrypted GitPulse browser session and redirects to a visible signed-out page. Because the GitHub user token is deliberately not retained, GitHub-side installation removal is a separate action at [GitHub installation settings](https://github.com/settings/installations).

There is no shipped GitPulse account database or `/api/account/delete` endpoint. If durable accounts are introduced later, their data deletion and retention behavior must be documented before launch.

## Logs and secrets

Audit payloads pass through the redaction helper before optional persistence. Application code must still avoid logging raw credentials. Vercel environment variables containing GitHub secrets are server-only and must never use the `NEXT_PUBLIC_` prefix.
