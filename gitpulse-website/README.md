# GitPulse Website

The official Next.js website for [GitPulse](https://github.com/dinalegw/GitPulse), including public documentation, a disposable browser playground, and optional GitHub identity connection.

## Current capabilities

- Landing page and generated command documentation.
- Public playground running the real GitPulse binary in Vercel Sandbox.
- GitHub App user authorization for identity verification and installation-count discovery.
- Encrypted, cookie-based GitPulse web sessions.

GitHub connection does not currently run GitPulse against a user's repository. The local CLI remains the supported way to operate on an owned repository.

## Requirements

- Node.js 24
- pnpm 10.34.5
- A Vercel-linked development environment for live Vercel Sandbox execution

```bash
cd gitpulse-website
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

The static pages and tests do not require provider credentials. Copy `.env.example` to `.env.local` only when testing configured integrations.

## Environment variables

GitHub sign-in requires:

```text
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=https://start-gitpulse.vercel.app/api/auth/callback
```

The GitHub App must register exactly the same callback URL. Preview deployments intentionally begin sign-in on the production hostname.

Playground controls:

```text
PLAYGROUND_MAX_SECONDS=60
PLAYGROUND_MAX_CONCURRENT_PER_IP=3
RATE_LIMIT_PER_MINUTE=5
RATE_LIMIT_PER_HOUR=20
```

Production Vercel deployments use Vercel OIDC for Sandbox. Optional `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` enable distributed run metadata, audit records, idempotency, and rate limits; legacy `KV_REST_API_*` names remain accepted. Authentication sessions do not depend on Redis.

## Playground design

Each accepted request creates a new Vercel Sandbox, prepares a demo Git repository with a local bare fake origin, runs one allow-listed command, streams NDJSON events to the browser, and deletes the sandbox in a `finally` path. GitHub credentials are explicitly absent. Interactive stdin is not supported.

See [`docs/playground.md`](../docs/playground.md) for limits and threat boundaries.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm audit --prod
```

CLI metadata lives in `lib/commands.ts`. When adding a command, update that source and the related playground policy/tests.

## Deployment

The Vercel project root must be `gitpulse-website`. Add environment variables to the intended environment and redeploy after changing them. The canonical production site is [start-gitpulse.vercel.app](https://start-gitpulse.vercel.app/).

## Responsible use

GitPulse automates Git operations a user configures. It is not a tool for deceiving GitHub or fabricating development activity. Automated changes should represent legitimate repository work.
