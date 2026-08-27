'use client';

import { cn } from '@/lib/utils';

const STEPS = [
  {
    number: '01',
    title: 'Metadata Generation',
    description: 'Appends timestamp + sequence to .gitpulse/activity.log',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'git add',
    description: 'Stages only the .gitpulse/ directory',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'git commit',
    description: 'Creates commit with configured message template',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    number: '04',
    title: 'git push',
    description: 'Pushes once per cycle to configured remote',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 9 15 15" />
        <line x1="21" y1="9" x2="9" y2="9" />
      </svg>
    ),
  },
];

export function StepDiagram() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((step, index) => (
        <div
          key={step.number}
          className="relative group"
        >
          {/* Connecting line */}
          {index < STEPS.length - 1 && (
            <div className="absolute top-5 left-[calc(50%+1px)] w-full h-0.5 bg-gradient-to-r from-border-subtle to-accent-primary/50 lg:hidden sm:block" />
          )}
          {index < STEPS.length - 1 && (
            <div className="hidden lg:block absolute top-5 left-[calc(50%+1px)] w-full h-0.5 bg-gradient-to-r from-border-subtle to-accent-primary/50" />
          )}

          <div className="relative flex flex-col items-center text-center p-4">
            {/* Step number */}
            <div className="relative z-10 mb-4">
              <div className="w-12 h-12 rounded-full bg-bg-primary border-2 border-border-subtle flex items-center justify-center text-accent-primary font-mono font-bold text-lg group-hover:border-accent-primary transition-colors">
                {step.number}
              </div>
              {/* Pulse ring animation */}
              <div className="absolute inset-0 rounded-full border-2 border-accent-primary/30 animate-pulse-slow opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Icon */}
            <div className="mb-3 p-3 bg-accent-primary/10 rounded-lg text-accent-primary group-hover:bg-accent-primary/20 transition-colors">
              {step.icon}
            </div>

            {/* Title */}
            <h3 className="font-semibold text-text-primary mb-1">{step.title}</h3>
            <p className="text-sm text-text-muted">{step.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}