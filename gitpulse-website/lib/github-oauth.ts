// GitHub App user-authorization integration.
//
// GitPulse uses a GitHub App, not a broad OAuth App. GitHub App user access
// tokens are fine-grained to the intersection of:
//   - repositories the GitHub App is installed on
//   - permissions granted to the GitHub App
//   - repositories the signed-in user can access
//
// Required production secrets:
//   GITHUB_CLIENT_ID
//   GITHUB_CLIENT_SECRET
//
// OAuth must always use one canonical, GitHub-App-registered callback. A
// preview deployment URL is not registered with GitHub and therefore must
// never be sent as redirect_uri.

import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from 'node:crypto';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'gitpulse_session';
export const OAUTH_STATE_COOKIE = 'gitpulse_oauth_state';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const SESSION_COOKIE_VERSION = 'v1';
const GITHUB_API_VERSION = '2026-03-10';
const DEFAULT_GITHUB_REDIRECT_URI =
  'https://start-gitpulse.vercel.app/api/auth/callback';

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
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
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
  const value = process.env[name]?.trim();
  if (!value) {
    throw new GitHubOAuthError(
      'github_oauth_not_configured',
      `${name} is not configured; set the GitHub App credentials in the deployment environment`,
      503
    );
  }
  return value;
}

export function isGitHubOAuthConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_CLIENT_ID?.trim() &&
      process.env.GITHUB_CLIENT_SECRET?.trim()
  );
}

export function getGitHubRedirectUri(): string {
  const raw = process.env.GITHUB_REDIRECT_URI?.trim() || DEFAULT_GITHUB_REDIRECT_URI;

  try {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:' ||
      url.pathname !== '/api/auth/callback' ||
      url.search ||
      url.hash
    ) {
      throw new Error('invalid callback URL');
    }
    return url.toString();
  } catch {
    throw new GitHubOAuthError(
      'github_redirect_uri_invalid',
      'GITHUB_REDIRECT_URI must be an HTTPS URL ending in /api/auth/callback',
      503
    );
  }
}

function githubHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
}

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

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const clientId = requireEnv('GITHUB_CLIENT_ID');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    allow_signup: 'true',
  });
  // GitHub App user access tokens do not use OAuth scopes. Permissions are
  // configured on the GitHub App and narrowed by the user's installation.
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(
  code: string,
  state: string,
  expectedState: string,
  redirectUri: string
): Promise<string> {
  if (!constantTimeEqual(state, expectedState)) {
    throw new GitHubOAuthError(
      'oauth_state_mismatch',
      'OAuth state did not match; refusing to exchange code',
      400
    );
  }

  const clientId = requireEnv('GITHUB_CLIENT_ID');
  const clientSecret = requireEnv('GITHUB_CLIENT_SECRET');

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
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new GitHubOAuthError(
      'github_token_exchange_failed',
      `GitHub token endpoint returned ${response.status}`,
      502
    );
  }

  const payload = (await response.json()) as GitHubTokenResponse;
  if (payload.error || !payload.access_token) {
    throw new GitHubOAuthError(
      'github_token_exchange_rejected',
      payload.error_description ||
        payload.error ||
        'GitHub rejected the authorization code',
      400
    );
  }

  return payload.access_token;
}

export async function fetchUserIdentity(
  accessToken: string
): Promise<{ user: GitHubUserIdentity; scopes: string[] }> {
  const response = await fetch('https://api.github.com/user', {
    headers: githubHeaders(accessToken),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new GitHubOAuthError(
      'github_user_profile_failed',
      `GitHub /user returned ${response.status}`,
      502
    );
  }

  const profile = (await response.json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string;
  };

  return {
    user: {
      id: profile.id,
      login: profile.login,
      name: profile.name,
      email: profile.email,
      avatar_url: profile.avatar_url,
    },
    // GitHub App user tokens are permission-based, not OAuth-scope based.
    scopes: [],
  };
}

export async function listInstallations(
  accessToken: string
): Promise<Array<{ id: number; account: { login: string } }>> {
  const response = await fetch('https://api.github.com/user/installations?per_page=100', {
    headers: githubHeaders(accessToken),
    cache: 'no-store',
  });

  if (!response.ok) {
    const hint =
      response.status === 403
        ? ' GitPulse must be registered as a GitHub App; ordinary OAuth App tokens cannot list GitHub App installations.'
        : '';
    throw new GitHubOAuthError(
      'github_installations_failed',
      `GitHub /user/installations returned ${response.status}.${hint}`,
      502
    );
  }

  const payload = (await response.json()) as {
    installations: Array<{ id: number; account: { login: string } }>;
  };
  return payload.installations;
}

export async function revokeAccessToken(accessToken: string): Promise<void> {
  const clientId = requireEnv('GITHUB_CLIENT_ID');
  const clientSecret = requireEnv('GITHUB_CLIENT_SECRET');
  try {
    await fetch(`https://api.github.com/applications/${clientId}/token`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${clientId}:${clientSecret}`
        ).toString('base64')}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: accessToken }),
      cache: 'no-store',
    });
  } catch (error) {
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

function sessionEncryptionKey(): Buffer {
  return createHash('sha256')
    .update(requireEnv('GITHUB_CLIENT_SECRET'))
    .digest();
}

export function encodeSessionCookie(session: AuthSession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sessionEncryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(session), 'utf8');
  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    SESSION_COOKIE_VERSION,
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    tag.toString('base64url'),
  ].join('.');
}

export function decodeSessionCookie(value: string): AuthSession | null {
  try {
    const [version, ivRaw, ciphertextRaw, tagRaw] = value.split('.');
    if (
      version !== SESSION_COOKIE_VERSION ||
      !ivRaw ||
      !ciphertextRaw ||
      !tagRaw
    ) {
      return null;
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      sessionEncryptionKey(),
      Buffer.from(ivRaw, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');

    const session = JSON.parse(plaintext) as AuthSession;
    if (
      !session ||
      typeof session.sessionId !== 'string' ||
      !session.user ||
      !Array.isArray(session.installationIds) ||
      session.expiresAt <= Date.now()
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function setSessionCookie(session: AuthSession) {
  const jar = await cookies();
  jar.set({
    ...buildSessionCookieOptions(SESSION_TTL_SECONDS),
    value: encodeSessionCookie(session),
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set({
    ...buildSessionCookieOptions(0),
    value: '',
  });
}

export async function readSessionCookie(): Promise<AuthSession | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return decodeSessionCookie(raw);
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
