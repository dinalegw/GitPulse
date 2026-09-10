import { NextResponse } from 'next/server';
import {
  isGitHubOAuthConfigured,
  readSessionCookie,
} from '@/lib/github-oauth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const configured = isGitHubOAuthConfigured();
  const session = configured ? await readSessionCookie() : null;

  if (!session) {
    return NextResponse.json(
      { authenticated: false, configured },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      configured,
      user: {
        login: session.user.login,
        name: session.user.name,
        avatar_url: session.user.avatar_url,
      },
      installationCount: session.installationIds.length,
      expiresAt: session.expiresAt,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
