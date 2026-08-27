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
  label = 'Copy install command',
  variant = 'primary',
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
    <div className="flex items-center gap-3">
      <Button
        variant={variant}
        size="md"
        onClick={handleCopy}
        aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
      >
        {copied ? (
          <>
            <Check className="h-4 w-4" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            {label}
          </>
        )}
      </Button>
      <code className="code-inline text-sm max-w-[300px] truncate block">{command}</code>
    </div>
  );
}