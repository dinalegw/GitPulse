'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { CheckCircle2, Github } from 'lucide-react';

export default function ConnectSuccessPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 py-12 lg:py-20">
        <div className="section-container">
          <div className="max-w-2xl mx-auto">
            <Card className="border-accent-primary/30 bg-accent-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-accent-primary" />
                  GitHub connected
                </CardTitle>
                <CardDescription>
                  GitPulse now knows who you are. You can pick a repository on the next step.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row gap-3">
                <Link href="/">
                  <Button>
                    <Github className="h-5 w-5" />
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