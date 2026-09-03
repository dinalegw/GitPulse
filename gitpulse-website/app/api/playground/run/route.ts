import { NextRequest, NextResponse } from 'next/server';
import { createSandboxSession, executeCommand, cleanupSession, validateCommand, startInteractiveProcess } from '@/lib/sandbox';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { getClientIP } from '@/lib/utils';
import {
  createRun,
  findRunByIdempotencyKey,
  loadRun,
  transitionState,
} from '@/lib/run-store';
import { appendAuditEvent } from '@/lib/audit-log';
import type { PlaygroundState } from '@/lib/playground-state';

// Force dynamic rendering for streaming
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const userAgent = request.headers.get('user-agent') ?? undefined;

  // Rate limiting
  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before starting another session.', state: 'RATE_LIMITED' as PlaygroundState },
      { status: 429, headers: getRateLimitHeaders(rateLimit) }
    );
  }

  try {
    const body = await request.json();
    const { sessionId, command, args, idempotencyKey } = body;

    if (!sessionId || !command || !idempotencyKey) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, command, idempotencyKey' },
        { status: 400, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    // Validate command against allow-list
    const validation = validateCommand(command, args);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    // Idempotency: a double-clicked Run with the same idempotencyKey
    // returns the existing run rather than spawning a second sandbox.
    const safeArgs = Array.isArray(args) ? args.map((a: unknown) => String(a)) : [];
    const existing = await findRunByIdempotencyKey(command, safeArgs, idempotencyKey);
    if (existing) {
      return NextResponse.json(
        {
          runId: existing.runId,
          state: existing.state,
          replay: true,
        },
        { headers: getRateLimitHeaders(rateLimit) }
      );
    }

    // Create run record first so the state machine has a canonical home.
    const run = await createRun({
      sessionId,
      command,
      args: safeArgs,
      idempotencyKey,
      ip,
    });
    await appendAuditEvent({
      type: 'playground_run_created',
      ip,
      userAgent,
      command,
      runId: run.runId,
    });

    // Check if client wants SSE streaming (for interactive commands)
    const acceptHeader = request.headers.get('accept');
    const wantsSSE = acceptHeader?.includes('text/event-stream');

    try {
      await transitionState(run.runId, 'STARTING');
      await createSandboxSession(sessionId, command, safeArgs, ip);
    } catch (error) {
      await transitionState(run.runId, 'START_FAILED', {
        errorMessage: error instanceof Error ? error.message : 'Sandbox start failed',
      });
      await appendAuditEvent({
        type: 'playground_run_start_failed',
        ip,
        command,
        runId: run.runId,
        message: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'Failed to start sandbox',
          runId: run.runId,
          state: 'START_FAILED' as PlaygroundState,
        },
        { status: 500, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    if (wantsSSE) {
      await transitionState(run.runId, 'RUNNING');
      return streamSSE(run.runId, sessionId, command, safeArgs, rateLimit, ip);
    } else {
      await transitionState(run.runId, 'RUNNING');
      const result = await executeCommand(sessionId, command, safeArgs);
      const finalState: PlaygroundState = result.exitCode === 0 ? 'SUCCEEDED' : 'FAILED';
      await transitionState(run.runId, finalState, { exitCode: result.exitCode });
      await cleanupSession(sessionId, ip);
      await transitionState(run.runId, 'CLEANUP');
      await transitionState(run.runId, 'DISPOSED');

      return NextResponse.json(
        {
          runId: run.runId,
          state: finalState,
          exitCode: result.exitCode,
          output: result.stdout,
          stderr: result.stderr,
        },
        { headers: getRateLimitHeaders(rateLimit) }
      );
    }
  } catch (error) {
    console.error('[API] Playground run error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: getRateLimitHeaders(rateLimit) }
    );
  }
}

async function streamSSE(
  runId: string,
  sessionId: string,
  command: string,
  args: string[],
  rateLimit: { allowed: boolean; remaining: number; resetTime: number; limit: number },
  clientIp?: string
) {
  const encoder = new TextEncoder();
  let closed = false;
  let exited = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const sendError = (message: string) => {
        send({ type: 'error', message });
        closed = true;
        controller.close();
      };

      const finalize = async (exitCode: number | undefined, reason: string) => {
        if (exited) return;
        exited = true;
        let next: PlaygroundState = 'FAILED';
        if (reason === 'exit' && exitCode === 0) next = 'SUCCEEDED';
        if (reason === 'cancel') next = 'CANCELLED';
        if (reason === 'timeout') next = 'TIMED_OUT';
        await transitionState(runId, next, { exitCode });
        await transitionState(runId, 'CLEANUP');
        await cleanupSession(sessionId, clientIp).catch(console.error);
        await transitionState(runId, 'DISPOSED');
      };

      try {
        await startInteractiveProcess(
          sessionId,
          command,
          args,
          (data: string) => send({ type: 'output', content: data }),
          (data: string) => send({ type: 'output', content: data }),
          async (exitCode: number) => {
            send({ type: 'exit', code: exitCode });
            closed = true;
            await finalize(exitCode, 'exit');
            try { controller.close(); } catch { /* already closed */ }
          },
        );

        // Watchdog: if the PTY stream never reports an exit within
        // MAX_SESSION_SECONDS we mark TIMED_OUT.
        const maxMs = parseInt(process.env.PLAYGROUND_MAX_SECONDS || '60', 10) * 1000;
        setTimeout(() => {
          if (exited || closed) return;
          send({ type: 'timeout' });
          void finalize(undefined, 'timeout');
          try { controller.close(); } catch { /* */ }
        }, maxMs + 2000);

      } catch (error) {
        sendError(error instanceof Error ? error.message : 'Execution failed');
      }
    },

    cancel() {
      closed = true;
      void (async () => {
        await transitionState(runId, 'CANCELLED').catch(() => undefined);
        await transitionState(runId, 'CLEANUP').catch(() => undefined);
        await cleanupSession(sessionId, clientIp).catch(console.error);
        await transitionState(runId, 'DISPOSED').catch(() => undefined);
      })();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...getRateLimitHeaders(rateLimit),
    },
  });
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