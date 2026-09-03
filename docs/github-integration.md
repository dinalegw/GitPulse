# GitHub Integration Architecture

GitPulse integrates with GitHub through two completely separate
mechanisms. They share no code and exist for different reasons.

## 1. The CLI uses the local git credential helper

The GitPulse CLI (`gitpulse` binary) never asks for a GitHub token. It
delegates authentication to the user's existing git credential helper,
exactly like a hand-typed `git push`. This is described in detail in
[`github-push.md`](github-push.md).

This is the recommended path for users who already have git configured.
It works with SSH keys, HTTPS PATs in the OS keychain, GitHub CLI
authentication, and any other credential helper the user has set up.

## 2. The hosted website uses GitHub OAuth

The hosted website (`gitpulse-website/`) implements the standard GitHub
OAuth authorization-code flow so the user can sign in without pasting
a token into a web form. The implementation is in
`gitpulse-website/lib/github-oauth.ts`.

Flow:

```text
1. GET /api/auth/login
   - generate CSRF state, store in HttpOnly cookie
   - redirect to https://github.com/login/oauth/authorize
     with scope=read:user user:email repo
2. GitHub redirects back to /api/auth/callback with code + state
   - verify state matches cookie (constant-time compare)
   - POST code to https://github.com/login/oauth/access_token
   - GET https://api.github.com/user (with bearer token)
   - GET https://api.github.com/user/emails (with bearer token)
   - GET https://api.github.com/user/installations (with bearer token)
   - create AuthSession record, set HttpOnly session cookie
3. Subsequent requests carry the session cookie, not the bearer token
```

The bearer token is **never** persisted. It is used in-memory for the
duration of one callback handler, then dropped. The session cookie
carries only a random id; the session record itself holds identity,
scopes, and installation ids.

### Required environment variables

To enable GitHub sign-in in production:

```bash
GITHUB_CLIENT_ID=<oauth-app-client-id>
GITHUB_CLIENT_SECRET=<oauth-app-client-secret>
GITHUB_REDIRECT_URI=https://gitpulse.dev/api/auth/callback
```

When any of these are missing, the login route returns a structured
`github_oauth_not_configured` error and the UI renders a clear
explanation. The platform never silently misroutes users.

## Why a GitHub App is the future direction

OAuth Apps grant access to "everything the user can see". For the
hosted GitPulse product, the correct long-term primitive is a **GitHub
App** because:

- Installation tokens are scoped to specific repositories.
- Webhook delivery is first-class.
- Per-installation permission requests let us ask only for the
  permissions the selected repository actually needs.
- Users see a cleaner consent screen with our app name.

The OAuth flow described above is the right starting point: it works
without registering a GitHub App, lets the platform prove value, and
can be replaced wholesale by a GitHub App flow later without changing
the user-facing UX or the authorization helpers.

## Repository selection is authorization-safe

When the UI displays "pick a repository", it must NOT trust a
repository id supplied by the browser. The hosted platform fetches the
list from `GET /api/platform/installations` and renders only
repositories that belong to one of the user's installations. The
repository id is then signed into a server-side selection record before
any privileged operation references it.

This is enforced by `requireInstallationAccess` in
`gitpulse-website/lib/authorization.ts`. Calling that helper at the
top of any handler that takes a repository id is mandatory.

## Scopes and least privilege

The OAuth flow requests exactly the scopes it needs:

```text
read:user     - read the user's profile
user:email    - read the user's primary email
repo          - read and write to repositories the user owns
```

If the user grants a smaller set of scopes, the session is still
created but the UI must reflect the missing scopes (the GitHub
installation list will be empty, for example). We never silently widen
the requested scopes.

We do **not** request:

- `admin:repo_hook` - we do not manage webhooks ourselves
- `delete_repo`    - we never delete repositories
- `workflow`       - we never modify GitHub Actions
- `admin:org`      - we never modify organization settings

## Disconnect

POST `/api/auth/disconnect` clears the local session. Because we do
not persist the bearer token, there is nothing else to remove
locally. We instruct the user to also revoke GitPulse at
[https://github.com/settings/applications](https://github.com/settings/applications)
to fully revoke the GitHub-side grant.

## Threat model summary

| Threat | Defence |
| --- | --- |
| Stolen session cookie | HttpOnly + Secure + SameSite=Lax; 8-hour expiry |
| CSRF on callback | State cookie + constant-time comparison |
| Replay of authorization code | One-time-use by GitHub; per-IP counter |
| XSS in the SPA | No bearer tokens in JS bundles; all privileged I/O server-side |
| Token leakage in logs | `redact()` filter applied to every audit event |
| Privilege escalation | `requireAuthentication` + `requireFeature` at every handler entry |
| Repository spoofing | `requireInstallationAccess` server-side check |