# Open Source and Hosted-Service Boundary

The code currently published in this repository is MIT-licensed, including the Go CLI, bootstrap scripts, website, public playground, GitHub identity connection, and proposed TypeScript contracts. Secrets and user data are never part of the source license or repository.

The CLI is fully usable without the website. It runs on the user's machine and uses the user's local Git authentication. The public playground is also independent: it runs only in a disposable demo repository with a fake local origin.

Authenticated hosted repository automation, billing, persistent accounts, workspaces, and scheduled-job orchestration are future capabilities and are **not shipped here**. Documentation must not imply that a private production backend already exists unless such a service has actually been deployed and verified.

If a separate hosted service is created later, its license, privacy terms, permissions, operational controls, and boundary with this MIT repository must be documented based on the real implementation. Proposed contracts in `gitpulse-website/lib/domain.ts` and `lib/entitlements.ts` may inform that work but are not a backend.

Contributors may use, modify, and self-host the MIT code under the license terms. The GitPulse name and logo may be subject to separate trademark rules; the MIT license covers source code, not trademark rights.
