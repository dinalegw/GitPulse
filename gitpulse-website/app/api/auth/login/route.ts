import { NextRequest, NextResponse } from 'next/server';
import {
  buildAuthorizeUrl,
  generateState,
  setOAuthStateCookie,
  GitHubOAuthError,
  getGitHubRedirectUri,
} from '@/lib/github-oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const redirectUri = getGitHubRedirectUri();
    const canonicalOrigin = new URL(redirectUri).origin;
    if (new URL(request.url).origin !== canonicalOrigin) {
      return NextResponse.redirect(new URL('/api/auth/login', canonicalOrigin));
    }

    const { state, codeVerifier, codeChallenge } = generateState();
    await setOAuthStateCookie(state, codeVerifier);
    return NextResponse.redirect(
      buildAuthorizeUrl(state, redirectUri, codeChallenge)
    );
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
