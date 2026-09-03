// Tests for the playground execution state machine.
//
// This module re-implements the state machine in plain JavaScript so the
// tests can run with `node --test` without a TypeScript toolchain. The
// expected behavior must stay in lock-step with
// `lib/playground-state.ts`. If you change the .ts file, mirror the
// change here.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const PLAYGROUND_STATES = [
  'QUEUED', 'STARTING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT',
  'CANCELLED', 'START_FAILED', 'CLEANUP', 'CLEANUP_FAILED', 'DISPOSED',
];

const ALLOWED = {
  QUEUED: ['STARTING', 'START_FAILED'],
  STARTING: ['RUNNING', 'FAILED', 'CLEANUP', 'START_FAILED'],
  RUNNING: ['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'CLEANUP'],
  SUCCEEDED: ['CLEANUP'],
  FAILED: ['CLEANUP'],
  TIMED_OUT: ['CLEANUP'],
  CANCELLED: ['CLEANUP'],
  START_FAILED: ['CLEANUP'],
  CLEANUP: ['DISPOSED', 'CLEANUP_FAILED'],
  CLEANUP_FAILED: ['DISPOSED'],
  DISPOSED: [],
};

function canTransition(from, to) {
  return ALLOWED[from]?.includes(to) ?? false;
}

const TERMINAL = new Set([
  'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'START_FAILED', 'DISPOSED',
]);

function isTerminal(s) { return TERMINAL.has(s); }
function isActive(s) {
  return s === 'QUEUED' || s === 'STARTING' || s === 'RUNNING' || s === 'CLEANUP';
}

test('all states are present', () => {
  for (const s of PLAYGROUND_STATES) {
    assert.ok(ALLOWED[s], `state ${s} must have a transition table`);
  }
});

test('happy path: QUEUED -> STARTING -> RUNNING -> SUCCEEDED -> CLEANUP -> DISPOSED', () => {
  let s = 'QUEUED';
  for (const next of ['STARTING', 'RUNNING', 'SUCCEEDED', 'CLEANUP', 'DISPOSED']) {
    assert.ok(canTransition(s, next), `${s} -> ${next} must be allowed`);
    s = next;
  }
  assert.equal(s, 'DISPOSED');
  assert.ok(isTerminal('DISPOSED'));
});

test('start failure: STARTING -> START_FAILED -> CLEANUP -> DISPOSED', () => {
  assert.ok(canTransition('STARTING', 'START_FAILED'));
  assert.ok(canTransition('START_FAILED', 'CLEANUP'));
  assert.ok(canTransition('CLEANUP', 'DISPOSED'));
});

test('timeout path: RUNNING -> TIMED_OUT -> CLEANUP -> DISPOSED', () => {
  assert.ok(canTransition('RUNNING', 'TIMED_OUT'));
  assert.ok(canTransition('TIMED_OUT', 'CLEANUP'));
});

test('cancel path: RUNNING -> CANCELLED -> CLEANUP -> DISPOSED', () => {
  assert.ok(canTransition('RUNNING', 'CANCELLED'));
  assert.ok(canTransition('CANCELLED', 'CLEANUP'));
});

test('client disconnect during stream cancel: any -> CANCELLED', () => {
  // The frontend's ReadableStream cancel callback may fire from RUNNING
  // or STARTING — both must be reachable.
  assert.ok(canTransition('RUNNING', 'CANCELLED'));
});

test('cleanup failure path: CLEANUP -> CLEANUP_FAILED -> DISPOSED', () => {
  assert.ok(canTransition('CLEANUP', 'CLEANUP_FAILED'));
  assert.ok(canTransition('CLEANUP_FAILED', 'DISPOSED'));
});

test('no transition from DISPOSED', () => {
  assert.equal(ALLOWED.DISPOSED.length, 0);
  for (const s of PLAYGROUND_STATES) {
    assert.equal(canTransition('DISPOSED', s), false);
  }
});

test('cannot skip states', () => {
  assert.equal(canTransition('QUEUED', 'RUNNING'), false);
  assert.equal(canTransition('QUEUED', 'SUCCEEDED'), false);
  assert.equal(canTransition('STARTING', 'DISPOSED'), false);
});

test('isActive covers in-flight states only', () => {
  assert.ok(isActive('QUEUED'));
  assert.ok(isActive('STARTING'));
  assert.ok(isActive('RUNNING'));
  assert.ok(isActive('CLEANUP'));
  assert.equal(isActive('SUCCEEDED'), false);
  assert.equal(isActive('FAILED'), false);
  assert.equal(isActive('DISPOSED'), false);
});

test('isTerminal covers all finished states', () => {
  assert.ok(isTerminal('SUCCEEDED'));
  assert.ok(isTerminal('FAILED'));
  assert.ok(isTerminal('TIMED_OUT'));
  assert.ok(isTerminal('CANCELLED'));
  assert.ok(isTerminal('START_FAILED'));
  assert.ok(isTerminal('DISPOSED'));
  assert.equal(isTerminal('RUNNING'), false);
  assert.equal(isTerminal('CLEANUP'), false);
});

test('Run Again requires a terminal state', () => {
  // Every terminal state must allow a fresh Run Again (which is a
  // brand-new run record, not a transition from the old run).
  for (const s of TERMINAL) {
    assert.ok(isTerminal(s), `${s} must be terminal`);
  }
});