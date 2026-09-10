'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Github, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';

interface MeResponse {
  authenticated: boolean;
  user?: { login: string; name: string | null; avatar_url: string };
  configured?: boolean;
  installationCount?: number;
}

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'You declined the GitHub authorization. Nothing was changed.',
  missing_code_or_state: 'The GitHub callback was missing required parameters. Please try again.',
  missing_state_cookie: 'Your sign-in session expired before GitHub redirected back. Please try again.',
  oauth_state_mismatch: 'The sign-in attempt did not pass our CSRF check. Please try again.',
  github_oauth_not_configured:
    'GitHub sign-in is not configured yet. The site operator must register GitPulse as a GitHub App and set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in Vercel.',
  github_redirect_uri_invalid:
    'GitHub sign-in has an invalid callback URL. The site operator must set GITHUB_REDIRECT_URI to the registered HTTPS callback URL.',
  github_token_exchange_failed: 'GitHub did not accept the authorization code. Please try again.',
  github_token_exchange_rejected: 'GitHub rejected the authorization code. Please try again.',
  github_user_profile_failed: 'GitHub did not return your user profile. Please try again.',
  github_installations_failed: 'GitHub sign-in succeeded, but GitPulse could not read the repositories/installations authorized for this GitHub App. Confirm the app is installed on at least one repository.',
  oauth_login_failed: 'GitHub sign-in could not start. Please try again.',
  rate_limited: 'Too many sign-in attempts. Please wait a minute and try again.',
};

function ConnectContent() {
  const params = useSearchParams();
  const errorCode = params.get('error');
  const signedOut = params.get('status') === 'signed_out';
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json() as Promise<MeResponse>)
      .then((data) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {
        if (!cancelled) setMe({ authenticated: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="py-12 lg:py-16 border-b border-border-subtle">
        <div className="section-container">
          <div className="max-w-3xl mx-auto">
            <nav className="flex items-center gap-2 text-sm text-text-muted mb-6" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-text-primary transition-colors">Home</Link>
              <span className="mx-1">/</span>
              <span className="font-mono text-text-primary">Connect GitHub</span>
            </nav>
            <h1 className="heading-1 font-mono mb-2">
              <span className="gradient-pulse">Connect GitHub</span>
            </h1>
            <p className="text-lead">
              Optional. The playground and local CLI work without signing in. Connect only to verify
              your GitHub identity and view GitPulse App installations available to your account.
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 py-12">
        <div className="section-container">
          <div className="max-w-3xl mx-auto space-y-6">
            {errorCode && (
              <Card className="border-red-500/30 bg-red-500/5">
                <CardContent className="flex items-start gap-3 text-red-300">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium mb-1">Sign-in did not complete</p>
                    <p className="text-sm text-text-muted">
                      {ERROR_MESSAGES[errorCode] ?? `Unknown error (${errorCode}). Please try again.`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {signedOut && (
              <Card className="border-accent-primary/30 bg-accent-primary/5">
                <CardContent className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5 text-accent-primary" />
                  <div>
                    <p className="font-medium mb-1">Signed out of GitPulse</p>
                    <p className="text-sm text-text-muted">
                      Your local GitPulse web session was cleared. GitHub App access remains until
                      you remove it from your GitHub settings.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {me?.authenticated && me.user ? (
              <Card className="border-accent-primary/30 bg-accent-primary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-accent-primary" />
                    Already signed in as {me.user.login}
                  </CardTitle>
                  <CardDescription>
                    GitPulse verified your identity and found {me.installationCount ?? 0} GitHub App installation(s)
                    available to your account. This does not install or run the CLI on your computer.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-3">
                  <form action="/api/auth/disconnect" method="post">
                    <Button type="submit" variant="secondary">
                      Sign out of GitPulse
                    </Button>
                  </form>
                  <a
                    href="https://github.com/settings/installations"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center text-sm text-text-muted hover:text-text-primary"
                  >
                    Manage GitHub App access
                  </a>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Github className="h-5 w-5 text-accent-primary" />
                    Sign in with GitHub
                  </CardTitle>
                  <CardDescription>
                    GitPulse uses GitHub App authorization. We never ask for a personal access token or password.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="text-sm text-text-muted space-y-2 list-disc list-inside">
                    <li>You will be redirected to github.com to approve GitPulse.</li>
                    <li>GitHub shows the username of the account currently authorizing GitPulse.</li>
                    <li>This connection verifies identity and lists GitPulse App installations; it does not run the local CLI.</li>
                    <li>The GitHub user access token is used only during the callback and is never persisted.</li>
                    <li>Your signed-in session is stored in an encrypted HttpOnly cookie, so GitHub connection does not depend on KV.</li>
                  </ul>
                  {me?.configured === false ? (
                    <Button size="lg" className="w-full sm:w-auto" disabled>
                      <Github aria-hidden="true" className="h-5 w-5" />
                      GitHub App not configured
                    </Button>
                  ) : (
                    <a href="/api/auth/login">
                      <Button size="lg" className="w-full sm:w-auto">
                        <Github aria-hidden="true" className="h-5 w-5" />
                        Connect GitHub
                      </Button>
                    </a>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-accent-secondary" />
                  Why we don&apos;t ask for tokens
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-text-muted space-y-2">
                <p>
                  Asking a user to paste a personal access token into a web form trains people to share
                  long-lived credentials. GitPulse uses the standard OAuth flow so GitHub itself grants a
                  short-lived token scoped to the permissions you approve.
                </p>
                <p>
                  The hosted GitPulse backend never persists that token. If you later revoke GitPulse on
                  GitHub, its repository access ends immediately. Use the sign-out button above separately
                  to clear this browser&apos;s encrypted GitPulse session.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ConnectPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center text-text-muted">
        Loading…
      </div>
    }>
      <ConnectContent />
    </Suspense>
  );
}
