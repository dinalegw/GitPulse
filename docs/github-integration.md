# GitHub Integration Architecture

GitPulse has two separate GitHub integration paths.

## CLI authentication

The local Go CLI never asks users to paste a GitHub token into GitPulse. It
uses the user's existing Git credential helper, SSH setup, GitHub CLI
credentials, or other local Git authentication.

## Hosted website: GitHub App user authorization

The hosted website uses a **GitHub App** with GitHub's user authorization
web flow. This is intentionally not a classic OAuth App.

GitHub Apps are repository-installation scoped and use fine-grained
permissions. A user access token can only reach resources available to both
the signed-in user and the GitHub App installation.

Flow:

```text
GET /api/auth/login
  -> create CSRF state cookie
  -> derive /api/auth/callback from the current deployment URL
  -> redirect to github.com/login/oauth/authorize

GitHub callback
  -> verify state
  -> exchange authorization code
  -> GET /user
  -> GET /user/installations
  -> discard GitHub user access token
  -> encrypt identity + installation ids into HttpOnly session cookie
  -> redirect to /connect/success
```

The user access token is never persisted. GitPulse does not require Vercel KV
for authentication sessions.

## Required GitHub App configuration

Register GitPulse under GitHub **Settings -> Developer settings -> GitHub
Apps**.

Production callback URL:

```text
https://start-gitpulse.vercel.app/api/auth/callback
```

The Vercel deployment needs:

```text
GITHUB_CLIENT_ID=<GitHub App client id>
GITHUB_CLIENT_SECRET=<GitHub App client secret>
```

No `GITHUB_REDIRECT_URI` environment variable is required; the application
derives the callback URL from the live request. The callback URL still must be
registered in the GitHub App settings.

For repository operations, give the GitHub App only the minimum repository
permissions GitPulse needs. Git access requires the GitHub App **Contents**
permission. Users decide which repositories the app is installed on.

## Sessions

After GitHub authorization, GitPulse stores only non-token session metadata:

- GitHub user id
- login/name/avatar
- installation ids
- expiry metadata

That payload is encrypted and authenticated using AES-256-GCM in an
HttpOnly, Secure, SameSite=Lax cookie. Rotating the GitHub client secret
invalidates existing GitPulse web sessions.

## Repository authorization

Server-side authorization checks compare requested installation ids against
the installation ids captured from GitHub for the signed-in user. Browser UI
state is never treated as an authorization boundary.

## Disconnect

Disconnect clears the local encrypted session cookie. Because GitPulse does
not retain the GitHub user access token, full GitHub-side revocation is done
from the user's GitHub application/installations settings.
