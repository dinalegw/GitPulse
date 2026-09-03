import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCodeForToken,
  fetchUserIdentity,
  listInstallations,
  newSessionId,
  setSessionCookie,
  readOAuthStateCookie,
  clearOAuthStateCookie,
  GitHubOAuthError,
  type AuthSession,
} from '@/lib/github-oauth';
import { saveSession } from '@/lib/session-store';
import { appendAuditEvent } from '@/lib/audit-log';
import { recordAuthorizationCode } from '@/lib/oauth-attempt-tracker';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return NextResponse.redirect(new URL(`/connect?error=${encodeURIComponent(oauthError)}`, request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/connect?error=missing_code_or_state', request.url));
  }

  const expectedState = await readOAuthStateCookie();
  if (!expectedState) {
    return NextResponse.redirect(new URL('/connect?error=missing_state_cookie', request.url));
  }
  await clearOAuthStateCookie();

  try {
    const accessToken = await exchangeCodeForToken(code, state, expectedState);
    recordAuthorizationCode();
    const { user, scopes } = await fetchUserIdentity(accessToken);
    const installations = await listInstallations(accessToken);

    const sessionId = newSessionId();
    const now = Date.now();
    const session: AuthSession = {
      sessionId,
      createdAt: now,
      expiresAt: now + 8 * 60 * 60 * 1000,
      user,
      scopes,
      installationIds: installations.map((i) => i.id),
    };
    await saveSession(session);
    await setSessionCookie(sessionId);

    await appendAuditEvent({
      type: 'github_connected',
      actorUserId: user.id,
      actorLogin: user.login,
      scopes,
      installationCount: installations.length,
    });

    return NextResponse.redirect(new URL('/connect/success', request.url));
  } catch (error) {
    const code2 = error instanceof GitHubOAuthError ? error.code : 'oauth_callback_failed';
    if (error instanceof GitHubOAuthError) {
      await appendAuditEvent({
        type: 'github_connect_failed',
        error: error.code,
        message: error.message,
      });
    }
    return NextResponse.redirect(new URL(`/connect?error=${encodeURIComponent(code2)}`, request.url));
  }
}