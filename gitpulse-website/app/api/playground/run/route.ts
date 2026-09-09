import { NextRequest, NextResponse } from 'next/server';
import { runSandboxCommand, validateCommand } from '@/lib/sandbox';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { getClientIP } from '@/lib/utils';
import {
  createRun,
  findRunByIdempotencyKey,
  transitionState,
} from '@/lib/run-store';
import { appendAuditEvent } from '@/lib/audit-log';
import type { PlaygroundState } from '@/lib/playground-state';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const userAgent = request.headers.get('user-agent') ?? undefined;

  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded. Please wait before starting another run.',
        state: 'FAILED' as PlaygroundState,
      },
      { status: 429, headers: getRateLimitHeaders(rateLimit) }
    );
  }

  let runId: string | null = null;
  let enteredRunning = false;

  try {
    const body = await request.json();
    const { sessionId, command, args, idempotencyKey } = body;

    if (!sessionId || !command || !idempotencyKey) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, command, idempotencyKey' },
        { status: 400, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    const safeArgs = Array.isArray(args) ? args.map((a: unknown) => String(a)) : [];
    const validation = validateCommand(String(command), safeArgs);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error, state: 'FAILED' as PlaygroundState },
        { status: 400, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    const existing = await findRunByIdempotencyKey(
      String(command),
      safeArgs,
      String(idempotencyKey)
    );
    if (existing) {
      return NextResponse.json(
        {
          error: 'This run request was already accepted. Use Run Again for a fresh execution.',
          runId: existing.runId,
          state: existing.state,
          replay: true,
        },
        { status: 409, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    const run = await createRun({
      sessionId: String(sessionId),
      command: String(command),
      args: safeArgs,
      idempotencyKey: String(idempotencyKey),
      ip,
    });
    runId = run.runId;

    await appendAuditEvent({
      type: 'playground_run_created',
      ip,
      userAgent,
      command: String(command),
      runId,
    });

    await transitionState(runId, 'STARTING');

    const result = await runSandboxCommand(
      String(command),
      safeArgs,
      async () => {
        enteredRunning = true;
        await transitionState(runId!, 'RUNNING');
      }
    );

    const finalState: PlaygroundState =
      result.exitCode === 0 ? 'SUCCEEDED' : 'FAILED';

    await transitionState(runId, finalState, { exitCode: result.exitCode });
    await transitionState(runId, 'CLEANUP');

    if (result.cleanupError) {
      await transitionState(runId, 'CLEANUP_FAILED', {
        errorMessage: result.cleanupError,
      });
      await appendAuditEvent({
        type: 'playground_cleanup_failed',
        ip,
        command: String(command),
        runId,
        message: result.cleanupError,
      });
      await transitionState(runId, 'DISPOSED');
    } else {
      await transitionState(runId, 'DISPOSED');
    }

    await appendAuditEvent({
      type: 'playground_run_completed',
      ip,
      command: String(command),
      runId,
      metadata: {
        exitCode: result.exitCode,
        cleanupFailed: Boolean(result.cleanupError),
      },
    });

    return NextResponse.json(
      {
        runId,
        state: finalState,
        exitCode: result.exitCode,
        output: result.stdout,
        stderr: result.stderr,
        cleanupWarning: result.cleanupError,
      },
      { headers: getRateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';

    console.error('[API] Playground run error:', error);

    if (runId) {
      const failureState: PlaygroundState = enteredRunning ? 'FAILED' : 'START_FAILED';
      await transitionState(runId, failureState, { errorMessage: message }).catch(
        () => undefined
      );
      await transitionState(runId, 'CLEANUP').catch(() => undefined);
      await transitionState(runId, 'DISPOSED').catch(() => undefined);

      await appendAuditEvent({
        type: enteredRunning
          ? 'playground_run_failed'
          : 'playground_run_start_failed',
        ip,
        command: undefined,
        runId,
        message,
      });
    }

    return NextResponse.json(
      {
        error: message,
        runId,
        state: (enteredRunning ? 'FAILED' : 'START_FAILED') as PlaygroundState,
      },
      { status: 500, headers: getRateLimitHeaders(rateLimit) }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
