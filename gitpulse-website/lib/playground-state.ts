// Playground execution state machine.
//
// Explicit states cover the lifecycle of one playground run. The state
// machine is shared by the API route and the frontend so both sides
// reason about the same transitions.
//
// Transitions:
//   (none)         -> QUEUED        on POST /api/playground/run
//   QUEUED         -> STARTING      on sandbox-create success
//   QUEUED         -> START_FAILED  on sandbox-create error
//   STARTING       -> RUNNING       on first PTY/command execution
//   STARTING       -> FAILED        on init error
//   RUNNING        -> SUCCEEDED     on exit code 0
//   RUNNING        -> FAILED        on non-zero exit code
//   RUNNING        -> TIMED_OUT     on E2B timeout
//   RUNNING        -> CANCELLED     on user stop / disconnect
//   <any>          -> CLEANUP       on cleanup start
//   CLEANUP        -> CLEANUP_FAILED on kill error (sandbox already gone)
//   CLEANUP        -> DISPOSED      on success
//
// The frontend MUST treat DISPOSED as the only terminal state that
// permits a "Run Again" click. START_FAILED, FAILED, TIMED_OUT, and
// CANCELLED are also terminal but the UI should display the reason.

export const PLAYGROUND_STATES = [
  'QUEUED',
  'STARTING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'TIMED_OUT',
  'CANCELLED',
  'START_FAILED',
  'CLEANUP',
  'CLEANUP_FAILED',
  'DISPOSED',
] as const;

export type PlaygroundState = (typeof PLAYGROUND_STATES)[number];

const ALLOWED: Record<PlaygroundState, PlaygroundState[]> = {
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

export function canTransition(from: PlaygroundState, to: PlaygroundState): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertTransition(from: PlaygroundState, to: PlaygroundState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid playground state transition: ${from} -> ${to}`);
  }
}

// Terminal states are states from which no further automatic transition
// will happen. The user can still manually transition from any terminal
// state back into CLEANUP (e.g. by clicking "Stop" after a fast command
// has already exited), which is why every terminal state has CLEANUP in
// its allowed transitions.
export const TERMINAL_STATES: ReadonlySet<PlaygroundState> = new Set([
  'SUCCEEDED',
  'FAILED',
  'TIMED_OUT',
  'CANCELLED',
  'START_FAILED',
  'DISPOSED',
]);

export function isTerminal(state: PlaygroundState): boolean {
  return TERMINAL_STATES.has(state);
}

export function isActive(state: PlaygroundState): boolean {
  return state === 'QUEUED' || state === 'STARTING' || state === 'RUNNING' || state === 'CLEANUP';
}