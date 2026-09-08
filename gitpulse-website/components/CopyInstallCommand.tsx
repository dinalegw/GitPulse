'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface CopyInstallCommandProps {
  command?: string;
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export function CopyInstallCommand({
  command = 'git clone https://github.com/dinalegw/GitPulse.git && cd GitPulse && chmod +x scripts/bootstrap.sh && ./scripts/bootstrap.sh',
  label = 'Copy developer install',
  variant = 'secondary',
}: CopyInstallCommandProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center gap-3">
      <Button
        variant={variant}
        size="md"
        onClick={handleCopy}
        aria-label={copied ? 'Copied to clipboard' : 'Copy developer install command'}
      >
        {copied ? <><Check className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> {label}</>}
      </Button>
      <code className="code-inline text-xs max-w-[420px] truncate block">{command}</code>
    </div>
  );
}
