# Monetization Architecture

GitPulse is split into two layers:

- **Open source** — the CLI, the playground, the documentation, the
  public contracts. Everything in this layer is MIT-licensed and lives in
  this repository.
- **Hosted platform** — the backend service that runs scheduled jobs,
  stores run history, integrates with GitHub, and may eventually bill
  for premium features. This layer is not in this repository; it lives
  in a separate private repository and consumes the public contracts
  defined here.

The hosted platform can introduce paid features without rewriting the
open-source layer because the open-source layer never queries a billing
system. Instead, it asks "does the user have this entitlement?" and the
entitlement comes from a structured response.

## Plan tiers

The current plan catalogue (defined in `gitpulse-website/lib/entitlements.ts`):

- **Free** — the CLI, the playground, basic scheduled jobs, public repos.
- **Pro** — private repos, longer history retention, advanced scheduling.
- **Team** — team workspaces, shared policies, team dashboards.
- **Enterprise** — SSO, audit export, custom retention, dedicated
  infrastructure.

These tiers are *data*. Adding a new tier or changing what a tier unlocks
is a code change to one file (`entitlements.ts`), not a rewrite of the
authorization checks throughout the codebase.

## How a feature becomes paid

1. Add the feature id to `FEATURE_IDS` in `entitlements.ts`.
2. Add the feature id to the plan(s) that unlock it in `PLAN_FEATURES`.
3. At the top of the API route that serves the feature, call
   `requireFeature('feature_id')` from `lib/authorization.ts`.

That's it. The helper performs the canonical authorization chain:

```text
authenticated user
   +
authorized GitHub installation
   +
selected repository (where relevant)
   +
requested action's entitlement
```

There is no place in the codebase that compares a plan name to a string
literal to gate functionality. Plan names are referenced only by the
entitlement snapshot machinery.

## What the open-source CLI does *not* know

The CLI is independent of the hosted platform. It does not import any
plan-related code, does not check entitlements, and does not refuse to
run because the user is on a particular tier. It is fully usable without
ever connecting to the hosted platform.

## What the playground does *not* require

The playground at `/playground` runs without sign-in and without any
entitlement check. The hosted platform's "Free" plan defines what
playground features are available, but the playground itself is
reachable by anyone with network access to the site. This is the
explicit "public playground vs authorized automation" boundary.

## Anti-abuse as entitlement

Rate-limit features are themselves entitlements:

```text
playground.concurrency.1
playground.concurrency.3
playground.concurrency.10
platform.run_rate_limit.basic
platform.run_rate_limit.elevated
```

This is the structural answer to "what stops a paid user from making
the playground do work for them on demand?" — they have higher limits
encoded in their entitlement set, not a different code path.

## Why no fake billing today

The hosted platform is not yet shipping. Wiring up Stripe (or any
provider) before the underlying features exist would create UI debt. We
keep the entitlement surface stable so that adding billing later is a
configuration change.

## Roadmap

- `v0.x`: keep the entitlement surface stable, add real entitlements for
  scheduled jobs and longer history.
- `v1.x`: ship the hosted platform's free + pro tiers with real billing.
- `v2.x`: ship team and enterprise tiers; add SSO.

Each of these milestones uses the same authorization helpers. None of
them require refactoring the open-source CLI.