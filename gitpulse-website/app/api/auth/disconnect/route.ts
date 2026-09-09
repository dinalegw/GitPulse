import { NextResponse } from 'next/server';
import {
  clearSessionCookie,
  readSessionCookie,
} from '@/lib/github-oauth';
import { appendAuditEvent } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await readSessionCookie();
  await clearSessionCookie();

  await appendAuditEvent({
    type: 'github_disconnected',
    actorUserId: session?.user.id,
    actorLogin: session?.user.login,
  });

  return NextResponse.json({
    ok: true,
    message:
      'Local GitPulse session cleared. To revoke GitHub-side access too, uninstall or revoke GitPulse from your GitHub application settings.',
  });
}
