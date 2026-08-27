import { NextRequest, NextResponse } from 'next/server';
import { sendStdin, getSession } from '@/lib/sandbox';
import { getClientIP } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);

  try {
    const body = await request.json();
    const { sessionId, input } = body;

    if (!sessionId || input === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, input' },
        { status: 400 }
      );
    }

    // Verify session exists
    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 404 }
      );
    }

    // Send stdin to sandbox
    await sendStdin(sessionId, input);

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