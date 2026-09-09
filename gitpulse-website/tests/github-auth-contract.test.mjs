import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const oauth = readFileSync(new URL('../lib/github-oauth.ts', import.meta.url), 'utf8');
const login = readFileSync(new URL('../app/api/auth/login/route.ts', import.meta.url), 'utf8');
const callback = readFileSync(new URL('../app/api/auth/callback/route.ts', import.meta.url), 'utf8');
const me = readFileSync(new URL('../app/api/auth/me/route.ts', import.meta.url), 'utf8');
const authorization = readFileSync(new URL('../lib/authorization.ts', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

test('GitHub connection uses GitHub App user authorization rather than OAuth scopes', () => {
  assert.match(oauth, /GitHub App user-authorization/);
  assert.doesNotMatch(oauth, /scope:\s*['"]read:user/);
  assert.match(oauth, /user\/installations\?per_page=100/);
  assert.match(oauth, /X-GitHub-Api-Version/);
});

test('OAuth callback URI is derived from the live request', () => {
  assert.match(login, /new URL\('\/api\/auth\/callback', request\.url\)/);
  assert.match(callback, /new URL\('\/api\/auth\/callback', request\.url\)/);
  assert.doesNotMatch(oauth, /GITHUB_REDIRECT_URI/);
  assert.doesNotMatch(envExample, /GITHUB_REDIRECT_URI=/);
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
