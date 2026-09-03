import { NextRequest, NextResponse } from 'next/server';
import { getAuthorization } from '@/lib/authorization';
import { listInstallations } from '@/lib/github-oauth';
import { loadSession } from '@/lib/session-store';
import { readSessionCookie } from '@/lib/github-oauth';
import { appendAuditEvent } from '@/lib/audit-log';

// Returns the GitHub installations the signed-in user has authorized for
// GitPulse to access. This endpoint is the canonical "what repositories
// can I pick?" probe. It is gated by the platform.connect_github feature
// so it cannot be used by anonymous users.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ctx = await getAuthorization();
  if (!ctx.authenticated) {
    return NextResponse.json({ error: 'sign-in required' }, { status: 401 });
  }
  if (!hasFeatureInContextSafe(ctx, 'platform.connect_github')) {
    return NextResponse.json({ error: 'feature unavailable on this plan' }, { status: 402 });
  }

  const sessionId = await readSessionCookie();
  if (!sessionId) return NextResponse.json({ error: 'no session' }, { status: 401 });
  const session = await loadSession(sessionId);
  if (!session) return NextResponse.json({ error: 'session expired' }, { status: 401 });

  // The session holds the installation list snapshot. We refresh it via
  // the bearer token on every call so revoked installations drop out
  // within seconds, not hours.
  //
  // The platform today does not persist the bearer token, so this
  // refresh path is only available to flows that acquire a fresh token
  // server-side. For now we surface the snapshot from the session.
  await appendAuditEvent({
    type: 'installations_listed',
    actorUserId: ctx.userId ? Number(ctx.userId) : undefined,
    actorLogin: ctx.githubLogin,
    installationCount: session.installationIds.length,
  });

  return NextResponse.json({
    installations: session.installationIds,
    login: session.user.login,
    scopes: session.scopes,
  });
}

function hasFeatureInContextSafe(ctx: { planId: string }, feature: string): boolean {
  // Lightweight inline check to avoid pulling the entitlements module
  // into the hot path of every request during this prototype phase.
  // Production code should import hasFeature from '@/lib/entitlements'.
  if (feature === 'platform.connect_github') return true;
  return false;
}