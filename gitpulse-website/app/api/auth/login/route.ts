import { NextRequest, NextResponse } from 'next/server';
import {
  buildAuthorizeUrl,
  generateState,
  setOAuthStateCookie,
  GitHubOAuthError,
} from '@/lib/github-oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { state } = generateState();
    await setOAuthStateCookie(state);
    const redirectUri = new URL('/api/auth/callback', request.url).toString();
    return NextResponse.redirect(buildAuthorizeUrl(state, redirectUri));
  } catch (error) {
    const code =
      error instanceof GitHubOAuthError
        ? error.code
        : 'oauth_login_failed';
    return NextResponse.redirect(
      new URL(`/connect?error=${encodeURIComponent(code)}`, request.url)
    );
  }
}
