import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlaygroundCommand, validatePlaygroundRequestBody } from '../lib/playground-policy.js';

const commands = [
  {
    name: 'init',
    flags: [
      { name: '--repo', type: 'string' },
      { name: '--branch', type: 'string' },
      { name: '--commits', type: 'number' },
      { name: '--enabled', type: 'boolean' },
      { name: '--dry-run', type: 'boolean' },
      { name: '--no-detect', type: 'boolean' },
    ],
  },
  {
    name: 'config',
    flags: [
      { name: 'show', type: 'string' },
      { name: 'path', type: 'string' },
      { name: 'set <key> <value>', type: 'string' },
    ],
  },
  {
    name: 'run',
    flags: [
      { name: '--schedule', type: 'boolean' },
      { name: '--daemon', type: 'boolean' },
      { name: '--once', type: 'boolean' },
      { name: '--dry-run', type: 'boolean' },
      { name: '--no-dry-run', type: 'boolean' },
      { name: '--count', type: 'number' },
    ],
  },
  {
    name: 'logs',
    flags: [
      { name: '-n, --lines', type: 'number' },
      { name: '--tail', type: 'boolean' },
    ],
  },
  { name: 'status', flags: [] },
  { name: 'validate', flags: [] },
  { name: 'doctor', flags: [] },
  { name: 'version', flags: [] },
];

const configKeys = ['enabled', 'repository_path', 'commits_per_day'];
const scratch = '/vercel/sandbox/scratch-repo';
const validate = (command, args) =>
  validatePlaygroundCommand(command, args, commands, configKeys, scratch);

test('allows the default dry-run command', () => {
  assert.deepEqual(validate('run', ['--dry-run', '--count', '2']), { valid: true });
});

test('blocks schedule and daemon in both plain and equals syntax', () => {
  for (const arg of ['--schedule', '--schedule=true', '--daemon', '--daemon=false']) {
    assert.equal(validate('run', [arg]).valid, false, arg);
  }
});

test('enforces bounded count for separate and equals syntax', () => {
  assert.equal(validate('run', ['--count=5']).valid, true);
  assert.equal(validate('run', ['--count=6']).valid, false);
  assert.equal(validate('run', ['--count', '0']).valid, false);
  assert.equal(validate('run', ['--count', 'abc']).valid, false);
  assert.equal(validate('run', ['--count']).valid, false);
  assert.equal(
    validate('run', ['--count', '2', '--count=3']).valid,
    false
  );
});

test('accepts both logs aliases and bounds output', () => {
  assert.equal(validate('logs', ['-n', '20']).valid, true);
  assert.equal(validate('logs', ['--lines=200']).valid, true);
  assert.equal(validate('logs', ['--lines=201']).valid, false);
  assert.equal(validate('logs', ['--tail']).valid, false);
  assert.equal(validate('logs', ['--tail=true']).valid, false);
});

test('rejects positional arguments for no-argument commands', () => {
  for (const command of ['status', 'validate', 'doctor', 'version']) {
    assert.equal(validate(command, ['unexpected']).valid, false, command);
  }
});

test('config only accepts show, path, or exact set shape', () => {
  assert.equal(validate('config', []).valid, true);
  assert.equal(validate('config', ['show']).valid, true);
  assert.equal(validate('config', ['path']).valid, true);
  assert.equal(validate('config', ['set', 'enabled', 'true']).valid, true);
  assert.equal(validate('config', ['set', 'unknown', 'true']).valid, false);
  assert.equal(validate('config', ['set', 'enabled']).valid, false);
  assert.equal(validate('config', ['remove', 'enabled']).valid, false);
});

test('init stays inside the disposable scratch repository', () => {
  assert.equal(validate('init', ['--repo', '.']).valid, true);
  assert.equal(validate('init', [`--repo=${scratch}`]).valid, true);
  assert.equal(validate('init', ['--repo', '/tmp/other']).valid, false);
  assert.equal(validate('init', ['--commits=10']).valid, true);
  assert.equal(validate('init', ['--commits=11']).valid, false);
});

test('rejects unknown flags and oversized requests', () => {
  assert.equal(validate('run', ['--unknown']).valid, false);
  assert.equal(validate('run', Array(21).fill('--dry-run')).valid, false);
  assert.equal(validate('run', ['x'.repeat(257)]).valid, false);
});

test('request body validation is strict', () => {
  assert.equal(
    validatePlaygroundRequestBody({
      sessionId: 'session-1',
      command: 'version',
      args: [],
      idempotencyKey: 'key-1',
    }).valid,
    true
  );
  assert.equal(validatePlaygroundRequestBody(null).valid, false);
  assert.equal(
    validatePlaygroundRequestBody({
      sessionId: 'session-1',
      command: 'version',
      args: 'not-array',
      idempotencyKey: 'key-1',
    }).valid,
    false
  );
});
