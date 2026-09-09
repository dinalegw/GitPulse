import { NextResponse } from 'next/server';
import { getAuthorization } from '@/lib/authorization';
import { readSessionCookie } from '@/lib/github-oauth';
import { appendAuditEvent } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getAuthorization();
  if (!ctx.authenticated) {
    return NextResponse.json({ error: 'sign-in required' }, { status: 401 });
  }

  const session = await readSessionCookie();
  if (!session) {
    return NextResponse.json({ error: 'session expired' }, { status: 401 });
  }

  await appendAuditEvent({
    type: 'installations_listed',
    actorUserId: ctx.userId ? Number(ctx.userId) : undefined,
    actorLogin: ctx.githubLogin,
    installationCount: session.installationIds.length,
  });

  return NextResponse.json({
    installations: session.installationIds,
    login: session.user.login,
  });
}
