import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, readSessionCookie } from '@/lib/github-oauth';
import { deleteSession } from '@/lib/session-store';
import { appendAuditEvent } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const sessionId = await readSessionCookie();
  if (sessionId) {
    await deleteSession(sessionId);
  }
  await clearSessionCookie();
  await appendAuditEvent({ type: 'session_logout', sessionIdPresent: Boolean(sessionId) });
  return NextResponse.redirect(new URL('/', request.url));
}