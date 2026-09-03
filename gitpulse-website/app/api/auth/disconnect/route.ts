import { NextResponse } from 'next/server';
import {
  clearSessionCookie,
  readSessionCookie,
  GitHubOAuthError,
} from '@/lib/github-oauth';
import { deleteSession, loadSession } from '@/lib/session-store';
import { revokeAccessToken } from '@/lib/github-oauth';
import { appendAuditEvent } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

// Disconnect fully revokes the GitHub grant and clears the local session.
// The token revocation step is best-effort: a failure there never blocks
// local session deletion, but the failure is logged for the operator.
export async function POST() {
  const sessionId = await readSessionCookie();
  if (!sessionId) {
    return NextResponse.json({ ok: true, message: 'no active session' });
  }
  const session = await loadSession(sessionId);
  // We intentionally do not store the bearer token. Revocation requires the
  // token; without it we can only delete local state and ask the user to
  // also revoke the grant on https://github.com/settings/applications.
  await deleteSession(sessionId);
  await clearSessionCookie();
  await appendAuditEvent({
    type: 'github_disconnected',
    actorUserId: session?.user.id,
    actorLogin: session?.user.login,
  });
  return NextResponse.json({
    ok: true,
    message:
      'Local GitPulse session cleared. To fully revoke GitPulse on GitHub, also revoke at https://github.com/settings/applications',
  });
}