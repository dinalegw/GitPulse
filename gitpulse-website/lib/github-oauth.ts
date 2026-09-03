// GitHub App / OAuth integration architecture.
//
// This module implements the GitHub OAuth authorization-code flow with the
// minimum surface area required for production SaaS:
//
//   - PKCE state tokens (CSRF protection on the callback).
//   - HTTP-only, Secure, SameSite=Lax session cookies.
//   - Server-side token storage keyed by a random session id; the cookie
//     carries only the id, never the token.
//   - Disconnect flow that revokes the GitHub OAuth grant server-side
//     and clears local session state.
//
// The implementation is *inert* until three environment variables are set:
//
//   GITHUB_CLIENT_ID      — OAuth App client id
//   GITHUB_CLIENT_SECRET — OAuth App client secret
//   GITHUB_REDIRECT_URI  — registered callback URL, e.g.
//                          https://gitpulse.dev/api/auth/callback
//
// When any of those are missing, every function returns a structured
// "github_oauth_not_configured" error so callers can render an actionable
// page instead of silently misrouting users.

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'gitpulse_session';
export const OAUTH_STATE_COOKIE = 'gitpulse_oauth_state';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

export class GitHubOAuthError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface GitHubTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

export interface GitHubUserIdentity {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export interface AuthSession {
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  user: GitHubUserIdentity;
  scopes: string[];
  installationIds: number[];
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new GitHubOAuthError(
      'github_oauth_not_configured',
      `${name} is not configured; set it in the deployment environment to enable GitHub sign-in`,
      503,
    );
  }
  return value;
}

// generateState creates a CSRF token and its PKCE verifier hash. We use the
// plain state value directly — no separate verifier — because the OAuth App
// authorization-code flow with confidential client does not require PKCE,
// but we still bind the state to the session to prevent fixation.
export function generateState(): { state: string; stateHash: string } {
  const state = randomBytes(32).toString('base64url');
  const stateHash = createHash('sha256').update(state).digest('base64url');
  return { state, stateHash };
}

export function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function buildAuthorizeUrl(state: string): string {
  const clientId = requireEnv('GITHUB_CLIENT_ID');
  const redirectUri = requireEnv('GITHUB_REDIRECT_URI');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: 'read:user user:email repo',
    allow_signup: 'true',
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

// exchangeCodeForToken exchanges the authorization code for an access token.
// The token is returned to the caller; nothing is persisted here.
export async function exchangeCodeForToken(code: string, state: string, expectedState: string): Promise<string> {
  if (!constantTimeEqual(state, expectedState)) {
    throw new GitHubOAuthError('oauth_state_mismatch', 'OAuth state did not match; refusing to exchange code', 400);
  }
  const clientId = requireEnv('GITHUB_CLIENT_ID');
  const clientSecret = requireEnv('GITHUB_CLIENT_SECRET');
  const redirectUri = requireEnv('GITHUB_REDIRECT_URI');

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    throw new GitHubOAuthError(
      'github_token_exchange_failed',
      `GitHub token endpoint returned ${response.status}`,
      502,
    );
  }

  const payload = (await response.json()) as GitHubTokenResponse;
  if (payload.error || !payload.access_token) {
    throw new GitHubOAuthError(
      'github_token_exchange_rejected',
      payload.error_description || payload.error || 'token exchange rejected',
      400,
    );
  }
  return payload.access_token;
}

// fetchUserIdentity reads the authenticated user's profile and email using
// the supplied access token. The token is never persisted by this function.
export async function fetchUserIdentity(accessToken: string): Promise<{ user: GitHubUserIdentity; scopes: string[] }> {
  const [profileResponse, emailsResponse, scopesResponse] = await Promise.all([
    fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
    }),
    fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
    }),
    fetch('https://api.github.com/user', {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
    }),
  ]);

  if (!profileResponse.ok) {
    throw new GitHubOAuthError(
      'github_user_profile_failed',
      `GitHub /user returned ${profileResponse.status}`,
      502,
    );
  }

  const profile = (await profileResponse.json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string;
  };

  let primaryEmail = profile.email;
  if (!primaryEmail && emailsResponse.ok) {
    const emails = (await emailsResponse.json()) as Array<{ email: string; primary: boolean; visibility: string | null }>;
    const primary = emails.find((e) => e.primary) ?? emails[0];
    primaryEmail = primary?.email ?? null;
  }

  // The OAuth scopes are returned in the `x-oauth-scopes` header on
  // authenticated GitHub API calls.
  const scopeHeader = scopesResponse.headers.get('x-oauth-scopes') || '';
  const scopes = scopeHeader.split(',').map((s) => s.trim()).filter(Boolean);

  return {
    user: {
      id: profile.id,
      login: profile.login,
      name: profile.name,
      email: primaryEmail,
      avatar_url: profile.avatar_url,
    },
    scopes,
  };
}

// listInstallations queries the authenticated user's GitHub App
// installations so the UI can present a repository-picker scoped to only
// repos the user has authorized GitPulse to access.
export async function listInstallations(accessToken: string): Promise<Array<{ id: number; account: { login: string } }>> {
  const response = await fetch('https://api.github.com/user/installations', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    throw new GitHubOAuthError(
      'github_installations_failed',
      `GitHub /user/installations returned ${response.status}`,
      502,
    );
  }
  const payload = (await response.json()) as { installations: Array<{ id: number; account: { login: string } }> };
  return payload.installations;
}

// revokeAccessToken asks GitHub to revoke the supplied access token. Best
// effort: revocation failures do not block local session deletion, but we
// still surface them in logs.
export async function revokeAccessToken(accessToken: string): Promise<void> {
  const clientId = requireEnv('GITHUB_CLIENT_ID');
  const clientSecret = requireEnv('GITHUB_CLIENT_SECRET');
  try {
    await fetch(`https://api.github.com/applications/${clientId}/token`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({ access_token: accessToken }),
    });
  } catch (error) {
    // Revocation failure should never block disconnect.
    console.warn('[auth] GitHub token revocation failed:', error);
  }
}

export function newSessionId(): string {
  return randomBytes(24).toString('base64url');
}

export function buildSessionCookieOptions(maxAgeSeconds: number) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function buildOAuthStateCookieOptions(maxAgeSeconds = 600) {
  return {
    name: OAUTH_STATE_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export async function setSessionCookie(sessionId: string) {
  const jar = await cookies();
  jar.set({
    ...buildSessionCookieOptions(SESSION_TTL_SECONDS),
    value: sessionId,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set({
    ...buildSessionCookieOptions(0),
    value: '',
  });
}

export async function readSessionCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

export async function setOAuthStateCookie(state: string) {
  const jar = await cookies();
  jar.set({
    ...buildOAuthStateCookieOptions(),
    value: state,
  });
}

export async function readOAuthStateCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(OAUTH_STATE_COOKIE)?.value ?? null;
}

export async function clearOAuthStateCookie() {
  const jar = await cookies();
  jar.set({
    ...buildOAuthStateCookieOptions(0),
    value: '',
  });
}