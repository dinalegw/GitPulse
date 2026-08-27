'use client';

import { Shield, Lock, Zap, GitBranch, Globe, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

const BADGES = [
  {
    icon: Shield,
    title: 'Safe by Default',
    description: 'Validates repo state before every run — rejects dirty trees, detached HEAD, bare repos',
    color: 'accent-primary',
  },
  {
    icon: Lock,
    title: 'Local & Private',
    description: '100% local execution — no telemetry, no GitHub API calls, no external network requests',
    color: 'accent-secondary',
  },
  {
    icon: Zap,
    title: 'Fast & Lightweight',
    description: 'Single binary, ~5MB, starts in milliseconds — written in Go, zero runtime dependencies',
    color: 'blue',
  },
];

export function TrustBadges() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {BADGES.map((badge, index) => {
        const Icon = badge.icon;
        const colorClasses = {
          'accent-primary': 'text-accent-primary bg-accent-primary/10 border-accent-primary/20',
          'accent-secondary': 'text-accent-secondary bg-accent-secondary/10 border-accent-secondary/20',
          'blue': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        }[badge.color];

        return (
          <div
            key={badge.title}
            className={cn(
              'card p-6 text-center transition-all duration-300',
              'hover:border-accent-primary/50 hover:shadow-card-hover'
            )}
          >
            <div className={cn('inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4', colorClasses)}>
              <Icon className="h-7 w-7" />
            </div>
            <h3 className="font-semibold text-text-primary mb-2">{badge.title}</h3>
            <p className="text-sm text-text-muted leading-relaxed">{badge.description}</p>
          </div>
        );
      })}
    </div>
  );
}

export function PlatformIcons() {
  return (
    <div className="flex items-center gap-6 text-text-muted/60">
      <div className="flex items-center gap-2" title="Windows">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.9 16.1c-.4-.7-1-1.2-1.7-1.3l-7-.7c-.4 0-.7.1-1 .3l-1.1 1.1c-.3.3-.3.7 0 1l1.1 1.1c.3.2.6.3 1 .3l7-.7c.7-.1 1.3-.6 1.7-1.3.6-.9.3-2-.7-2.5zM12.4 20.4l-6.7 1.7c-.3.1-.6-.1-.8-.4l-1.3-1.9c-.1-.2-.1-.5.1-.7l5.8-6.5c.2-.2.5-.3.8-.3.7 0 1.4.1 2 .3l3.3 3.3c.3.3.3.7 0 1l-2.6 2.6c-.3.2-.6.3-.9.3-.7 0-1.3-.2-1.8-.5-.3-.2-.5-.5-.5-.8zM22 9V4a2 2 0 0 0-2-2h-5v1h5v5h1zm-5-1h-2V2h2v6zm-6 0v-3h-2v3h2zm0 6h-2v3h2v-3z" />
        </svg>
        <span className="text-sm font-medium">Windows</span>
      </div>
      <div className="flex items-center gap-2" title="macOS">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.8 12.5c0 2.7-1.5 5.2-4 6.1V23H7v-4.4c-2.5-.9-4-3.4-4-6.1 0-3.1 2.2-5.7 5.2-6.3V4.6c-.5-.2-1-.3-1.5-.3-2 0-3.5 1.2-4 2.8l1.3 3.5c.3-1 1.2-1.8 2.2-1.8 1.4 0 2.5.9 2.9 2.1l.8-2.2c.9-1.7 2.8-2.9 4.9-2.9 2.5 0 4.7 1.7 5.1 3.9l-1.4 3.4c-.3-1-1.3-1.9-2.5-1.9-1.4 0-2.5.8-2.9 2l-.8 2.3h.1V4.6c.5.2 1 .4 1.5.4 2 0 3.5-1.2 4-2.8l-1.3-3.5c-.3 1-1.2 1.8-2.2 1.8-1.4 0-2.5-.9-2.9-2.1l-.8 2.3c-.9 1.7-2.8 2.9-4.9 2.9-2.5 0-4.7-1.7-5.1-3.9l1.4-3.4c.3 1 1.3 1.9 2.5 1.9 1.3 0 2.5-.8 2.9-2.1.3-.9.3-1.9.3-2.8V2H7v4.4c2.5.9 4 3.4 4 6.1z" />
        </svg>
        <span className="text-sm font-medium">macOS</span>
      </div>
      <div className="flex items-center gap-2" title="Linux">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17 20h5v-2a3 3 0 0 0-5.356-1.857M4 20h5v-2a3 3 0 0 1 5.356-1.857M6 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h2M20 10h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M9 3v2m6-2v2M7 14h10M7 18h10" />
        </svg>
        <span className="text-sm font-medium">Linux</span>
      </div>
    </div>
  );
}