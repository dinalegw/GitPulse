# Open Source vs Hosted Platform Boundary

This document describes what is open source, what is not, and why.

## The split

| Layer | Location | License | Visibility |
| --- | --- | --- | --- |
| GitPulse CLI (`cmd/`, `internal/`, `main.go`) | This repository | MIT | Public |
| Bootstrap installer (`scripts/bootstrap.{sh,ps1}`) | This repository | MIT | Public |
| CLI documentation (`docs/`, `README.md`, `CHANGELOG.md`) | This repository | MIT | Public |
| Playground front-end (`gitpulse-website/app/playground`, `gitpulse-website/components`) | This repository | MIT | Public |
| Playground API surface (`gitpulse-website/app/api/playground`) | This repository | MIT | Public |
| Playground library code (`gitpulse-website/lib/{sandbox,commands,rate-limit,utils,playground-state,run-store,audit-log}.ts`) | This repository | MIT | Public |
| OAuth + authorization library code (`gitpulse-website/lib/{github-oauth,session-store,authorization,entitlements,domain,oauth-attempt-tracker}.ts`) | This repository | MIT | Public |
| Hosted backend (account, workspace, subscription, billing, scheduled-job orchestration) | Private repository | Proprietary | Not public |
| Hosted database schema | Private repository | Proprietary | Not public |
| Billing integration | Private repository | Proprietary | Not public |
| Anti-abuse systems | Private repository | Proprietary | Not public |

## Why this split

Three user constituencies are served by GitPulse:

1. **End users** who want to automate GitHub activity.
2. **Developers** who want to read, modify, and contribute to the CLI.
3. **Blacksauce operations** who want commercial control over the
   hosted platform.

The CLI is, by design, **fully usable without ever contacting the
hosted platform**. A user can install it with the bootstrap installer,
run `gitpulse init`, and never interact with our website. This is the
open-source promise.

The hosted platform, on the other hand, requires infrastructure
(billing, identity, anti-abuse, observability, scheduled workers).
Putting that infrastructure in a public repository would leak
operational secrets and make the platform trivially cloneable by
competitors. The MIT license protects the CLI, not the hosted service.

## What does *not* change because of this split

- The CLI behavior is identical whether or not you use the hosted
  platform. There is no platform-specific build.
- The playground front-end and the public API surface (allow-listed
  commands, rate limiter, state machine) are MIT and live in this
  repository.
- The contracts the hosted backend depends on (entitlements,
  authorization helpers, audit event types) are MIT and live in this
  repository.
- The hosted backend is a *consumer* of the open-source contracts. It
  is not a copy of them. If you self-host the playground you are
  reusing the same MIT code; you are not forking it.

## Why the library code is MIT even though the hosted backend is not

Library code that defines **contracts** (entitlements, authorization
helpers, state machines) is more useful when it is open. A partner
integrating with GitPulse can implement the same contract on their
backend without negotiating license terms. The library code does not
expose operational details — it is a contract, not an implementation.

## What is *not* open by design

- Secrets required to run the hosted platform (database URLs, signing
  keys, billing provider keys, OAuth client secrets).
- Internal hosted-platform services (scheduled-job orchestrator, billing
  webhook handlers, anti-abuse ML models, operational dashboards).
- Customer data the hosted platform stores.

## What this means for contributors

- Pull requests that touch library contracts are welcomed.
- Pull requests that move operational logic out of the open-source
  repository are not merged. Keep operational logic in the private
  repository.
- If you fork GitPulse to host your own version, you are welcome to
  use the MIT code as a starting point. You do not need our permission.
  You are also responsible for everything you ship under your own
  brand.

## Trademark

The GitPulse name and logo are trademarks of BLACKSAUCE. The MIT license
covers the source code; it does not cover the trademark. You may use
the source under the MIT terms; if you ship a derivative product,
please pick a different name to avoid confusion.