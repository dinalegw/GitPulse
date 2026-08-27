'use client';

import { AlertTriangle, Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

export function ResponsibleUseCallout() {
  return (
    <Card className="border-accent-primary/30 bg-accent-primary/5" padding="lg">
      <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-shrink-0 p-2 bg-accent-primary/20 rounded-lg text-accent-primary">
          <Shield className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-text-primary mb-1">Responsible Use</h3>
          <p className="text-text-muted text-sm leading-relaxed">
            GitPulse automates Git operations you configure. It is <strong>not</strong> a tool for deceiving
            GitHub or fabricating the appearance of development activity. You are responsible for ensuring
            that automated commits accurately reflect meaningful repository activity.
          </p>
        </div>
        <div className="flex-shrink-0">
          <AlertTriangle className="h-5 w-5 text-accent-primary/70" />
        </div>
      </CardContent>
    </Card>
  );
}