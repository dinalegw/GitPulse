import { NextRequest, NextResponse } from 'next/server';
import {
  clearSessionCookie,
  readSessionCookie,
} from '@/lib/github-oauth';
import { appendAuditEvent } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await readSessionCookie();
  await clearSessionCookie();

  await appendAuditEvent({
    type: 'github_disconnected',
    actorUserId: session?.user.id,
    actorLogin: session?.user.login,
  });

  const response = NextResponse.redirect(
    new URL('/connect?status=signed_out', request.url),
    303
  );
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
