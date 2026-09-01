// Tests for the audit-log redaction function. The redaction logic must:
//   - strip bearer tokens from strings
//   - strip credentials embedded in URLs (user:pass@host)
//   - mask emails
//   - redact keys whose name looks secret-like (password, token, etc.)
//   - never persist raw secret values

import { test } from 'node:test';
import assert from 'node:assert/strict';

const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/g;
const URL_SECRET = /https?:\/\/[^\s/]*:[^\s/@]+@[^\s/]+/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SECRET_KEY = /(password|passwd|token|access_token|authorization|secret|client_secret|code|set-cookie)/i;

function redact(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    let out = value.replace(BEARER, 'Bearer <redacted>');
    out = out.replace(URL_SECRET, (m) => m.replace(/:[^/@]+@/, ':<redacted>@'));
    out = out.replace(EMAIL, '<email>');
    return out;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY.test(k)) result[k] = '<redacted>';
      else result[k] = redact(v);
    }
    return result;
  }
  return value;
}

test('redacts bearer tokens', () => {
  const out = redact('Authorization: Bearer ghp_abcdef1234567890');
  assert.equal(out, 'Authorization: Bearer <redacted>');
  assert.equal(out.includes('ghp_'), false);
});

test('redacts credentials in URLs', () => {
  const out = redact('fetching https://user:secret123@example.com/path');
  assert.equal(out.includes('secret123'), false);
  assert.ok(out.includes('<redacted>@'));
});

test('masks emails', () => {
  const out = redact('login: jane.doe@example.com today');
  assert.equal(out, 'login: <email> today');
});

test('object key "password" is fully redacted regardless of value', () => {
  const out = redact({ password: 'hunter2', name: 'jane', access_token: 'tok' });
  assert.equal(out.password, '<redacted>');
  assert.equal(out.access_token, '<redacted>');
  assert.equal(out.name, 'jane');
});

test('redacts nested secret keys', () => {
  const out = redact({ user: { name: 'j', client_secret: 'xyz', nested: { code: 'abc' } } });
  assert.equal(out.user.name, 'j');
  assert.equal(out.user.client_secret, '<redacted>');
  assert.equal(out.user.nested.code, '<redacted>');
});

test('preserves non-sensitive content', () => {
  const original = 'GitPulse run started at 2026-09-01T10:00:00Z for repository jane/example';
  assert.equal(redact(original), original);
});

test('handles arrays of mixed content', () => {
  const out = redact(['hello jane@example.com', { token: 'abc' }, 'plain text']);
  assert.equal(out[0], 'hello <email>');
  assert.equal(out[1].token, '<redacted>');
  assert.equal(out[2], 'plain text');
});

test('handles null and undefined', () => {
  assert.equal(redact(null), null);
  assert.equal(redact(undefined), undefined);
});

test('never echoes a raw secret value', () => {
  const sensitiveInputs = [
    'Bearer ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
    'Authorization: Bearer ghp_x',
    'https://u:pw@host.example.com/x',
    { access_token: 'ghp_xxx', refresh_token: 'rt_yyy' },
  ];
  for (const input of sensitiveInputs) {
    const out = JSON.stringify(redact(input));
    assert.equal(out.includes('ghp_'), false, `redaction leaked: ${out}`);
    assert.equal(out.includes('ghp_x'), false, `redaction leaked: ${out}`);
    assert.equal(out.includes('ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789'), false, `redaction leaked: ${out}`);
    assert.equal(out.includes('pw@'), false, `redaction leaked: ${out}`);
    assert.equal(out.includes('rt_yyy'), false, `redaction leaked: ${out}`);
  }
});