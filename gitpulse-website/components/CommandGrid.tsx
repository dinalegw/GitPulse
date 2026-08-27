'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { COMMANDS, PLAYGROUND_COMMANDS } from '@/lib/commands';
import { cn } from '@/lib/utils';

const COMMAND_ICONS: Record<string, React.ReactNode> = {
  init: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  config: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  run: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  status: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M12 12l-2 2 4 4 8-8" />
    </svg>
  ),
  logs: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  validate: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  doctor: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22c-5.523 0-10-4.477-10-10S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  version: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
};

const CATEGORY_COLORS: Record<string, string> = {
  core: 'accent-primary',
  config: 'accent-secondary',
  run: 'accent-primary',
  inspect: 'blue',
  health: 'amber',
};

export function CommandGrid({ showAll = false }: { showAll?: boolean }) {
  const commands = showAll ? PLAYGROUND_COMMANDS : PLAYGROUND_COMMANDS.slice(0, 8);

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {commands.map((cmd) => {
        const Icon = COMMAND_ICONS[cmd.name] || (
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
        );
        const categoryColor = CATEGORY_COLORS[cmd.category] || 'accent-primary';

        return (
          <Card key={cmd.name} hover padding="md" className="group">
            <CardHeader>
              <div className={cn('flex items-center gap-3 mb-3', `text-${categoryColor}`)}>
                <div className="p-2 bg-current/10 rounded-lg">{Icon}</div>
                <CardTitle className="font-mono text-lg mb-0">{cmd.name}</CardTitle>
              </div>
              <CardDescription className="text-base">{cmd.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-text-muted">
                {cmd.flags.slice(0, 4).map((flag) => (
                  <li key={flag.name} className="flex items-center gap-2">
                    <code className="code-inline text-xs">{flag.name}</code>
                    <span className="text-xs">{flag.description}</span>
                  </li>
                ))}
                {cmd.flags.length > 4 && (
                  <li className="text-xs text-text-muted/50">+{cmd.flags.length - 4} more flags</li>
                )}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}