import { NextRequest, NextResponse } from 'next/server';
import { sendStdin, getSession, killProcess, resizePTY } from '@/lib/sandbox';
import { getClientIP } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);

  try {
    const body = await request.json();
    const { sessionId, input, cols, rows } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing required field: sessionId' },
        { status: 400 }
      );
    }

    // Verify session exists (now loads from KV)
    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 404 }
      );
    }

    // Handle PTY resize
    if (cols !== undefined && rows !== undefined) {
      await resizePTY(sessionId, cols, rows);
      return NextResponse.json({ success: true });
    }

    // Handle Ctrl+C (SIGINT) to stop the process
    if (input === '\x03' || input === 'SIGINT') {
      await killProcess(sessionId);
      return NextResponse.json({ success: true });
    }

    // Send stdin to sandbox
    if (input !== undefined) {
      await sendStdin(sessionId, input);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Playground input error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
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