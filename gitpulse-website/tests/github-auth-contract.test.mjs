import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const oauth = readFileSync(new URL('../lib/github-oauth.ts', import.meta.url), 'utf8');
const login = readFileSync(new URL('../app/api/auth/login/route.ts', import.meta.url), 'utf8');
const callback = readFileSync(new URL('../app/api/auth/callback/route.ts', import.meta.url), 'utf8');
const me = readFileSync(new URL('../app/api/auth/me/route.ts', import.meta.url), 'utf8');
const authorization = readFileSync(new URL('../lib/authorization.ts', import.meta.url), 'utf8');
const disconnect = readFileSync(new URL('../app/api/auth/disconnect/route.ts', import.meta.url), 'utf8');
const logout = readFileSync(new URL('../app/api/auth/logout/route.ts', import.meta.url), 'utf8');
const connectPage = readFileSync(new URL('../app/connect/page.tsx', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

test('GitHub connection uses GitHub App user authorization rather than OAuth scopes', () => {
  assert.match(oauth, /GitHub App user-authorization/);
  assert.doesNotMatch(oauth, /scope:\s*['"]read:user/);
  assert.match(oauth, /user\/installations\?per_page=100/);
  assert.match(oauth, /X-GitHub-Api-Version/);
  assert.match(oauth, /code_challenge_method: 'S256'/);
  assert.match(oauth, /code_verifier: codeVerifier/);
  assert.match(login, /setOAuthStateCookie\(state, codeVerifier\)/);
});

test('OAuth uses one validated canonical callback URI', () => {
  assert.match(oauth, /GITHUB_REDIRECT_URI/);
  assert.match(oauth, /https:\/\/start-gitpulse\.vercel\.app\/api\/auth\/callback/);
  assert.match(oauth, /url\.protocol !== 'https:'/);
  assert.match(oauth, /url\.pathname !== '\/api\/auth\/callback'/);
  assert.match(login, /getGitHubRedirectUri\(\)/);
  assert.match(login, /canonicalOrigin/);
  assert.match(callback, /getGitHubRedirectUri\(\)/);
  assert.match(envExample, /GITHUB_REDIRECT_URI=https:\/\/start-gitpulse\.vercel\.app\/api\/auth\/callback/);
});

test('disconnect is a POST sign-out flow that redirects to visible UI', () => {
  assert.match(disconnect, /export async function POST/);
  assert.match(disconnect, /clearSessionCookie\(\)/);
  assert.match(disconnect, /status=signed_out/);
  assert.match(disconnect, /303/);
  assert.match(disconnect, /Cache-Control', 'no-store/);
  assert.match(connectPage, /Sign out of GitPulse/);
  assert.match(connectPage, /github\.com\/settings\/installations/);
  assert.match(connectPage, /fetch\('\/api\/auth\/me', \{ cache: 'no-store' \}\)/);
  assert.match(logout, /export \{ POST \} from '\.\.\/disconnect\/route'/);
});

test('authenticated session is encrypted and independent of KV', () => {
  assert.match(oauth, /aes-256-gcm/);
  assert.match(oauth, /encodeSessionCookie/);
  assert.match(oauth, /decodeSessionCookie/);
  assert.match(callback, /setSessionCookie\(session\)/);
  assert.doesNotMatch(callback, /saveSession/);
  assert.doesNotMatch(me, /session-store/);
  assert.doesNotMatch(authorization, /session-store/);
});

test('missing GitHub configuration stays in the connect UI rather than raw JSON', () => {
  assert.match(login, /\/connect\?error=/);
  assert.match(oauth, /GITHUB_CLIENT_ID/);
  assert.match(oauth, /GITHUB_CLIENT_SECRET/);
  assert.match(envExample, /GITHUB_CLIENT_ID=/);
  assert.match(envExample, /GITHUB_CLIENT_SECRET=/);
});

test('OAuth error and cancellation cases map to non-sensitive UI messages', () => {
  for (const code of [
    'access_denied',
    'missing_code_or_state',
    'missing_state_cookie',
    'oauth_state_mismatch',
    'github_redirect_uri_invalid',
    'github_oauth_not_configured',
    'github_token_exchange_failed',
    'github_token_exchange_rejected',
    'github_user_profile_failed',
    'github_installations_failed',
  ]) {
    assert.match(connectPage, new RegExp(`${code}:`));
  }
  assert.match(callback, /if \(oauthError\)/);
  assert.match(callback, /missing_code_or_state/);
  assert.match(callback, /missing_state_cookie/);
  assert.match(oauth, /oauth_state_mismatch/);
  assert.match(oauth, /github_token_exchange_failed/);
  assert.match(oauth, /github_token_exchange_rejected/);
  assert.match(oauth, /github_user_profile_failed/);
  assert.match(oauth, /github_installations_failed/);
});

test('GitHub access token is callback-local and never placed in the session', () => {
  assert.match(callback, /const accessToken = await exchangeCodeForToken/);
  assert.doesNotMatch(callback, /accessToken,\s*\n?\s*user/);
  assert.doesNotMatch(oauth, /revokeAccessToken/);
  assert.doesNotMatch(oauth, /console\.(log|warn|error).*accessToken/);
});
