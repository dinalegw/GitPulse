import { NextResponse } from 'next/server';
import {
  buildAuthorizeUrl,
  generateState,
  setOAuthStateCookie,
  GitHubOAuthError,
} from '@/lib/github-oauth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { state } = generateState();
    await setOAuthStateCookie(state);
    const authorizeUrl = buildAuthorizeUrl(state);
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    if (error instanceof GitHubOAuthError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'oauth_login_failed' }, { status: 500 });
  }
}