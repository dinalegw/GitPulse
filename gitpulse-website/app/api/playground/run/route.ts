import { NextRequest, NextResponse } from 'next/server';
import { createSandboxSession, executeCommand, cleanupSession, validateCommand } from '@/lib/sandbox';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { getClientIP } from '@/lib/utils';

// Force dynamic rendering for streaming
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);

  // Rate limiting
  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before starting another session.' },
      { status: 429, headers: getRateLimitHeaders(rateLimit) }
    );
  }

  try {
    const body = await request.json();
    const { sessionId, command, args } = body;

    if (!sessionId || !command) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, command' },
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

    // Check if client wants SSE streaming (for interactive commands)
    const acceptHeader = request.headers.get('accept');
    const wantsSSE = acceptHeader?.includes('text/event-stream');

    // Create sandbox session
    const session = await createSandboxSession(sessionId, command, args);

    if (wantsSSE) {
      // Return SSE stream for interactive commands
      return streamSSE(session, command, args, rateLimit);
    } else {
      // Execute and return full result
      const result = await executeCommand(sessionId, command, args);
      await cleanupSession(sessionId);

      return NextResponse.json(
        {
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
  session: { sandboxId: string; sandbox: any },
  command: string,
  args: string[],
  rateLimit: { allowed: boolean; remaining: number; resetTime: number; limit: number }
) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const sendError = (message: string) => {
        send({ type: 'error', message });
        closed = true;
        controller.close();
      };

      try {
        // For interactive mode, we need to use the sandbox's PTY/terminal API
        // E2B's @e2b/code-interpreter supports terminal sessions
        const { sandbox } = session;

        // Start a terminal session for interactive commands
        // Note: This is a simplified version. Full implementation would use
        // sandbox.process.start() with stdin/stdout/stderr streaming

        // For now, execute the command and stream output
        const result = await executeCommand(session.sandboxId, command, args);

        // Send output in chunks to simulate streaming
        if (result.stdout) {
          const lines = result.stdout.split('\n');
          for (const line of lines) {
            send({ type: 'output', content: line + '\n' });
            // Small delay to simulate real-time output
            await new Promise((r) => setTimeout(r, 10));
          }
        }

        if (result.stderr) {
          const lines = result.stderr.split('\n');
          for (const line of lines) {
            send({ type: 'output', content: line + '\n' });
          }
        }

        send({ type: 'exit', code: result.exitCode });
        closed = true;
        controller.close();
      } catch (error) {
        sendError(error instanceof Error ? error.message : 'Execution failed');
      } finally {
        // Cleanup session after completion
        await cleanupSession(session.sandboxId);
      }
    },

    cancel() {
      closed = true;
      cleanupSession(session.sandboxId).catch(console.error);
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