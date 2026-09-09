'use client';

import { cn } from '@/lib/utils';

interface TerminalProps {
  className?: string;
  output?: string;
  initialOutput?: string;
  readOnly?: boolean;
}

export function Terminal({
  className,
  output,
  initialOutput = '',
}: TerminalProps) {
  const desiredOutput = output ?? initialOutput;

  return (
    <div
      className={cn('terminal-window', 'font-mono', className)}
      style={{ minHeight: '300px', height: '100%' }}
    >
      <div className="terminal-titlebar">
        <div className="terminal-dots" aria-hidden="true">
          <span className="terminal-dot terminal-dot-red" />
          <span className="terminal-dot terminal-dot-yellow" />
          <span className="terminal-dot terminal-dot-green" />
        </div>
        <div className="terminal-title">gitpulse</div>
      </div>

      <pre
        className="terminal-body overflow-auto whitespace-pre-wrap break-words p-4 text-sm leading-relaxed text-text-primary"
        style={{ height: 'calc(100% - 40px)', margin: 0 }}
        role="log"
        aria-live="polite"
        aria-label="GitPulse terminal output"
        data-testid="playground-terminal-output"
      >
        {desiredOutput || 'Select a command and click Run to see GitPulse output here.'}
      </pre>
    </div>
  );
}
