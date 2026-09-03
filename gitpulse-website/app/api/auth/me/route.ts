import { NextResponse } from 'next/server';
import { readSessionCookie } from '@/lib/github-oauth';
import { loadSession } from '@/lib/session-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sessionId = await readSessionCookie();
  if (!sessionId) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
  const session = await loadSession(sessionId);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
  // Never expose the full session object. Strip to the minimum the UI needs.
  return NextResponse.json({
    authenticated: true,
    user: {
      login: session.user.login,
      name: session.user.name,
      avatar_url: session.user.avatar_url,
    },
    scopes: session.scopes,
    installationCount: session.installationIds.length,
    expiresAt: session.expiresAt,
  });
}