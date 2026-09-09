import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, readSessionCookie } from '@/lib/github-oauth';
import { appendAuditEvent } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await readSessionCookie();
  await clearSessionCookie();
  await appendAuditEvent({
    type: 'session_logout',
    sessionIdPresent: Boolean(session),
    actorUserId: session?.user.id,
    actorLogin: session?.user.login,
  });
  return NextResponse.redirect(new URL('/', request.url));
}
