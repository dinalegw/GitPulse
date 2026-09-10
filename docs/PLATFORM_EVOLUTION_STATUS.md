# Platform Evolution Status

## Shipped in this repository

- Local Go CLI with validation, dry runs, scheduling, commits, pushes, diagnostics, and tests.
- Public Next.js website and documentation.
- Public Vercel Sandbox playground using a generated demo repository and fake local origin.
- Optional GitHub App user authorization that verifies identity, lists visible GitPulse App installation ids, and stores an encrypted eight-hour browser session.
- Optional Upstash Redis-backed playground metadata, audit events, idempotency, and rate limiting with in-memory fallback.

## Not shipped

- Hosted execution against a user's GitHub repository.
- Repository selection or repository-content access in the website.
- Persistent accounts, workspaces, subscriptions, billing, or entitlements.
- Hosted schedules, workers, durable job orchestration, or a customer run-history database.
- Automatic GitHub App uninstall/revocation during local website sign-out.

Files such as `lib/domain.ts` and `lib/entitlements.ts` are proposed contracts for future work; they do not make those services operational. Any hosted repository-write capability must add fresh server-side installation authorization, least-privilege GitHub permissions, durable execution controls, and dedicated end-to-end security tests before it is presented as available.
