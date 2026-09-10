# GitHub Integration

GitPulse has two independent GitHub paths. Connecting the website does not install or run the CLI.

## Local CLI authentication

The Go CLI runs on the user's computer. Git pushes use that computer's existing Git credential helper, SSH configuration, GitHub CLI credentials, or other local Git authentication. The CLI never asks a user to paste a private key or personal access token into the GitPulse website.

## Website identity connection

The website uses a GitHub App user-authorization flow to:

- verify the current GitHub identity;
- list GitPulse GitHub App installations visible to that identity; and
- create an eight-hour encrypted browser session.

It does **not** currently list repositories, modify repositories, run scheduled jobs, or execute the local CLI for the user.

```text
GET /api/auth/login
  -> move preview requests to the canonical production origin
  -> create a CSRF state and PKCE verifier cookie
  -> redirect to GitHub with the registered canonical callback

GET /api/auth/callback
  -> verify state
  -> exchange the one-time code with the PKCE verifier
  -> fetch /user and /user/installations
  -> discard the GitHub user access token
  -> store identity + installation ids in an encrypted HttpOnly cookie
  -> redirect to /connect/success
```

## Required configuration

Register GitPulse as a **GitHub App** and configure this exact callback URL in GitHub:

```text
Homepage URL: https://start-gitpulse.vercel.app
Callback/Redirect URI:
https://start-gitpulse.vercel.app/api/auth/callback
```

Set these variables for the Vercel Production environment:

```text
GITHUB_CLIENT_ID=<GitHub App client id>
GITHUB_CLIENT_SECRET=<GitHub App client secret>
GITHUB_REDIRECT_URI=https://start-gitpulse.vercel.app/api/auth/callback
```

The callback must use HTTPS, contain no query or fragment, and end exactly in `/api/auth/callback`. After changing variables, redeploy Production. Preview deployments intentionally begin sign-in on the canonical production hostname because their temporary callback URLs are not registered with GitHub.

The private key used to mint GitHub App installation tokens is **not required by the currently shipped identity-only flow**. If repository operations are implemented later, store the complete PEM value as a server-only Vercel secret, including its `BEGIN` and `END` lines, and never expose it with a `NEXT_PUBLIC_` name.

Never paste a GitHub private key, client secret, access token, authorization code, or session cookie into chat, a GitHub issue, a source file, or a commit. If one is exposed, revoke/rotate it immediately and replace the deployment secret.

For Vercel, set the project Root Directory to `gitpulse-website`, use Node.js 24 and pnpm 10.34.5, and keep `pnpm-lock.yaml` as the only package-manager lockfile. Apply GitHub credentials to Production; Preview may contain the same public Client ID, but OAuth still returns through the canonical Production callback. Redeploy after any environment-variable change.

### Troubleshooting

- “redirect_uri is not associated” means the outgoing callback does not exactly match the GitHub App callback above. Inspect the encoded `redirect_uri`, correct `GITHUB_REDIRECT_URI`, and redeploy.
- `github_token_exchange_rejected` commonly means the Client ID and Client Secret do not belong to the same GitHub App, or a one-time code was reused/expired. Rotate or correct the secret without displaying it.
- `missing_state_cookie` means the authorization attempt expired, switched browser contexts, or lost its cookie. Start again from `/connect`.
- `github_installations_failed` means the credential is not for the expected GitHub App or GitHub would not return the user's installations.

## What users see on GitHub

GitHub displays the username of the account currently signed in and authorizing the app. The owner/operator name shown beside the GitHub App is app metadata; it is not substituted into another user's identity. Every user sees their own signed-in username in the “Verify your GitHub identity” line.

## Session and disconnect behavior

The browser session stores GitHub user id, login/name/avatar, installation ids, and expiry metadata. It is encrypted and authenticated with AES-256-GCM in an HttpOnly, Secure, SameSite=Lax cookie. The GitHub access token is not persisted.

“Sign out of GitPulse” clears that browser cookie. It cannot also revoke GitHub-side access after the token has been discarded. A user can separately remove the GitHub App at [GitHub installation settings](https://github.com/settings/installations). Repository access ends when the installation is removed; an already-issued GitPulse browser cookie remains only an identity snapshot until it expires or is cleared.

## Future repository authorization

Installation ids cached in a browser session are not sufficient authorization for a write. Any future repository operation must mint a fresh installation token server-side and verify the selected installation, repository, current GitHub access, requested action, and entitlement at execution time.
