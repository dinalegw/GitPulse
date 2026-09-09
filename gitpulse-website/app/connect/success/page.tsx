'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { CheckCircle2, Github } from 'lucide-react';

function SuccessContent() {
  const params = useSearchParams();
  const installationCount = Number(params.get('installations') || '0');

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 py-12 lg:py-20">
        <div className="section-container">
          <div className="max-w-2xl mx-auto">
            <Card className="border-accent-primary/30 bg-accent-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-accent-primary" />
                  GitHub connected
                </CardTitle>
                <CardDescription>
                  {installationCount > 0
                    ? `GitPulse can see ${installationCount} GitHub App installation(s) authorized for your account.`
                    : 'Your GitHub identity is connected, but the GitPulse GitHub App is not installed on any repositories available to this account yet.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row gap-3">
                <Link href="/connect">
                  <Button>
                    <Github aria-hidden="true" className="h-5 w-5" />
                    Continue
                  </Button>
                </Link>
                <form action="/api/auth/disconnect" method="post">
                  <Button type="submit" variant="secondary">
                    Disconnect
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ConnectSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
      <SuccessContent />
    </Suspense>
  );
}
