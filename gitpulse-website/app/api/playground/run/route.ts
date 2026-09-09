import { NextRequest, NextResponse } from 'next/server';
import { runSandboxCommand, validateCommand } from '@/lib/sandbox';
import { validatePlaygroundRequestBody } from '@/lib/playground-policy';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { getClientIP } from '@/lib/utils';
import { claimRun, transitionState } from '@/lib/run-store';
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
  let commandForAudit: string | undefined;
  let enteredRunning = false;

  try {
    const body = await request.json();
    const requestValidation = validatePlaygroundRequestBody(body);
    if (!requestValidation.valid) {
      return NextResponse.json(
        { error: requestValidation.error, state: 'FAILED' as PlaygroundState },
        { status: 400, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    const sessionId = body.sessionId as string;
    const command = body.command as string;
    const safeArgs = body.args as string[];
    const idempotencyKey = body.idempotencyKey as string;
    commandForAudit = command;

    const validation = validateCommand(command, safeArgs);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error, state: 'FAILED' as PlaygroundState },
        { status: 400, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    const claim = await claimRun({
      sessionId,
      command,
      args: safeArgs,
      idempotencyKey,
      ip,
    });
    runId = claim.run.runId;

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

    await transitionState(runId, 'STARTING');

    const result = await runSandboxCommand(command, safeArgs, async () => {
      enteredRunning = true;
      await transitionState(runId!, 'RUNNING');
    });

    let outcomeState: PlaygroundState = result.state;
    if (outcomeState === 'START_FAILED' && enteredRunning) {
      outcomeState = 'FAILED';
    }

    await transitionState(runId, outcomeState, { exitCode: result.exitCode });
    await transitionState(runId, 'CLEANUP');

    let responseState = outcomeState;
    if (result.cleanupError) {
      await transitionState(runId, 'CLEANUP_FAILED', {
        errorMessage: result.cleanupError,
      });
      responseState = 'CLEANUP_FAILED';
      await appendAuditEvent({
        type: 'playground_cleanup_failed',
        ip,
        command,
        runId,
        message: result.cleanupError,
      });
    }

    await transitionState(runId, 'DISPOSED');

    await appendAuditEvent({
      type: 'playground_run_completed',
      ip,
      command,
      runId,
      metadata: {
        resultState: outcomeState,
        exitCode: result.exitCode ?? null,
        cleanupFailed: Boolean(result.cleanupError),
      },
    });

    const payload = {
      runId,
      state: responseState,
      lifecycleState: 'DISPOSED' as PlaygroundState,
      resultState: outcomeState,
      exitCode: result.exitCode,
      output: result.stdout,
      stderr: result.stderr,
      error: result.error,
      cleanupWarning: result.cleanupError,
    };

    if (responseState === 'TIMED_OUT') {
      return NextResponse.json(payload, {
        status: 504,
        headers: getRateLimitHeaders(rateLimit),
      });
    }

    if (
      responseState === 'START_FAILED' ||
      responseState === 'CLEANUP_FAILED' ||
      (responseState === 'FAILED' && result.exitCode === undefined)
    ) {
      return NextResponse.json(payload, {
        status: 500,
        headers: getRateLimitHeaders(rateLimit),
      });
    }

    return NextResponse.json(payload, {
      headers: getRateLimitHeaders(rateLimit),
    });
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
        command: commandForAudit,
        runId,
        message,
      });
    }

    return NextResponse.json(
      {
        error: message,
        runId,
        state: (enteredRunning ? 'FAILED' : 'START_FAILED') as PlaygroundState,
        lifecycleState: runId ? ('DISPOSED' as PlaygroundState) : undefined,
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
