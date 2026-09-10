import { NextRequest, NextResponse } from 'next/server';
import { runSandboxCommand, validateCommand } from '@/lib/sandbox';
import { validatePlaygroundRequestBody } from '@/lib/playground-policy';
import {
  encodePlaygroundEvent,
  PLAYGROUND_STREAM_CONTENT_TYPE,
} from '@/lib/playground-stream';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { getClientIP } from '@/lib/utils';
import { claimRun, transitionState } from '@/lib/run-store';
import { appendAuditEvent } from '@/lib/audit-log';
import type { PlaygroundState } from '@/lib/playground-state';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function elapsed(started: number): number {
  return Math.round((performance.now() - started) * 100) / 100;
}

export async function POST(request: NextRequest) {
  const requestStarted = performance.now();
  const ip = getClientIP(request);
  const userAgent = request.headers.get('user-agent') ?? undefined;

  const rateLimitStarted = performance.now();
  const rateLimit = await checkRateLimit(ip);
  const rateLimitMs = elapsed(rateLimitStarted);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded. Please wait before starting another run.',
        state: 'FAILED' as PlaygroundState,
      },
      { status: 429, headers: getRateLimitHeaders(rateLimit) }
    );
  }

  const validationStarted = performance.now();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON', state: 'FAILED' as PlaygroundState },
      { status: 400, headers: getRateLimitHeaders(rateLimit) }
    );
  }

  const requestValidation = validatePlaygroundRequestBody(body);
  if (!requestValidation.valid) {
    return NextResponse.json(
      { error: requestValidation.error, state: 'FAILED' as PlaygroundState },
      { status: 400, headers: getRateLimitHeaders(rateLimit) }
    );
  }

  const typedBody = body as {
    sessionId: string;
    command: string;
    args: string[];
    idempotencyKey: string;
  };
  const { sessionId, command, args: safeArgs, idempotencyKey } = typedBody;
  const validation = validateCommand(command, safeArgs);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error, state: 'FAILED' as PlaygroundState },
      { status: 400, headers: getRateLimitHeaders(rateLimit) }
    );
  }
  const validationMs = elapsed(validationStarted);

  const claimStarted = performance.now();
  const claim = await claimRun({
    sessionId,
    command,
    args: safeArgs,
    idempotencyKey,
    ip,
  });
  const claimMs = elapsed(claimStarted);
  const runId = claim.run.runId;

  if (!claim.created) {
    return NextResponse.json(
      {
        error: 'This run request was already accepted. Use Run Again for a fresh execution.',
        runId,
        state: claim.run.state,
        replay: true,
      },
      { status: 409, headers: getRateLimitHeaders(rateLimit) }
    );
  }

  await appendAuditEvent({
    type: 'playground_run_created',
    ip,
    userAgent,
    command,
    runId,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: Record<string, unknown>) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodePlaygroundEvent(event)));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      send({ type: 'state', state: 'QUEUED', runId });

      void (async () => {
        let enteredRunning = false;
        try {
          await transitionState(runId, 'STARTING');
          send({ type: 'state', state: 'STARTING', runId });

          const result = await runSandboxCommand(command, safeArgs, {
            onProgress(stage, message) {
              send({ type: 'progress', stage, message, runId });
            },
            onStdout(data) {
              send({ type: 'stdout', data, runId });
            },
            onStderr(data) {
              send({ type: 'stderr', data, runId });
            },
            async onReady() {
              enteredRunning = true;
              await transitionState(runId, 'RUNNING');
              send({ type: 'state', state: 'RUNNING', runId });
            },
          });

          let outcomeState: PlaygroundState = result.state;
          if (outcomeState === 'START_FAILED' && enteredRunning) {
            outcomeState = 'FAILED';
          }

          await transitionState(runId, outcomeState, {
            exitCode: result.exitCode,
            errorMessage: result.error,
          });
          send({ type: 'state', state: outcomeState, runId });

          await transitionState(runId, 'CLEANUP');
          send({ type: 'state', state: 'CLEANUP', runId });

          let cleanupState: PlaygroundState = 'DISPOSED';
          if (result.cleanupError) {
            await transitionState(runId, 'CLEANUP_FAILED', {
              errorMessage: result.cleanupError,
            });
            cleanupState = 'CLEANUP_FAILED';
            send({ type: 'state', state: 'CLEANUP_FAILED', runId });

            await appendAuditEvent({
              type: 'playground_cleanup_failed',
              ip,
              command,
              runId,
              message: result.cleanupError,
            });
          }

          await transitionState(runId, 'DISPOSED');

          const timings = {
            validationMs,
            rateLimitMs,
            claimMs,
            ...result.timings,
            totalServerMs: elapsed(requestStarted),
          };

          await appendAuditEvent({
            type: 'playground_run_completed',
            ip,
            command,
            runId,
            metadata: {
              resultState: outcomeState,
              exitCode: result.exitCode ?? null,
              cleanupFailed: Boolean(result.cleanupError),
              totalMs: Math.round(timings.totalServerMs),
            },
          });

          send({
            type: 'result',
            runId,
            state: cleanupState === 'CLEANUP_FAILED' ? 'CLEANUP_FAILED' : outcomeState,
            resultState: outcomeState,
            cleanupState,
            lifecycleState: 'DISPOSED',
            exitCode: result.exitCode,
            output: result.stdout,
            stderr: result.stderr,
            error: result.error,
            cleanupWarning: result.cleanupError,
            timings,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Internal server error';

          console.error('[API] Playground stream error:', {
            runId,
            command,
            error,
          });

          const failureState: PlaygroundState = enteredRunning
            ? 'FAILED'
            : 'START_FAILED';

          await transitionState(runId, failureState, {
            errorMessage: message,
          }).catch((transitionError) => {
            console.warn('[API] Failed to persist failure state:', transitionError);
          });
          await transitionState(runId, 'CLEANUP').catch((transitionError) => {
            console.warn('[API] Failed to persist cleanup state:', transitionError);
          });
          await transitionState(runId, 'DISPOSED').catch((transitionError) => {
            console.warn('[API] Failed to persist disposed state:', transitionError);
          });

          await appendAuditEvent({
            type: enteredRunning
              ? 'playground_run_failed'
              : 'playground_run_start_failed',
            ip,
            command,
            runId,
            message,
          });

          send({ type: 'error', message, runId });
          send({
            type: 'result',
            runId,
            state: failureState,
            resultState: failureState,
            cleanupState: 'DISPOSED',
            lifecycleState: 'DISPOSED',
            error: message,
            timings: {
              validationMs,
              rateLimitMs,
              claimMs,
              totalServerMs: elapsed(requestStarted),
            },
          });
        } finally {
          close();
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...getRateLimitHeaders(rateLimit),
      'Content-Type': PLAYGROUND_STREAM_CONTENT_TYPE,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Accel-Buffering': 'no',
    },
  });
}
