'use client';

import dynamicImport from 'next/dynamic';
import { CommandGrid } from '@/components/CommandGrid';
import { CopyInstallCommand } from '@/components/CopyInstallCommand';
import { ResponsibleUseCallout } from '@/components/ResponsibleUseCallout';
import { StepDiagram } from '@/components/StepDiagram';
import { TrustBadges, PlatformIcons } from '@/components/TrustBadges';
import { Github, ArrowRight, Check, Terminal as TerminalIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Dynamic import Terminal to avoid SSR issues with xterm.js
const Terminal = dynamicImport(() => import('@/components/Terminal').then(mod => mod.Terminal), {
  ssr: false,
  loading: () => (
    <div className="terminal-window font-mono animate-pulse" style={{ minHeight: '300px' }}>
      <div className="terminal-titlebar">
        <div className="terminal-dots">
          <span className="terminal-dot terminal-dot-red" />
          <span className="terminal-dot terminal-dot-yellow" />
          <span className="terminal-dot terminal-dot-green" />
        </div>
        <div className="terminal-title">gitpulse</div>
      </div>
      <div className="terminal-body h-[260px]" />
    </div>
  ),
});

const SAMPLE_OUTPUT = `$ gitpulse run --dry-run --count 3
GitPulse run (dry-run: true)
  Repository: /home/user/project
  Commits:    3

Created  3 commit(s)
Skipped  0 (nothing to commit)
Pushed   skipped (dry-run)
Duration 187.42ms`;

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <header className="relative overflow-hidden pt-20 pb-32 lg:pt-32 lg:pb-40">
        <div className="section-container">
          <div className="max-w-4xl mx-auto text-center">
            {/* Logo + Wordmark */}
            <div className="flex items-center justify-center gap-3 mb-8">
              <div className="relative">
                <svg className="h-14 w-14" viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="14" stroke="#22c55e" strokeWidth="2" fill="none" />
                  <path d="M16 8v8l5 5" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="16" cy="16" r="6" stroke="#22c55e" strokeWidth="1.5" fill="none" opacity="0.5" />
                </svg>
                {/* Pulse ring animation */}
                <div className="absolute inset-0 rounded-full border-2 border-accent-primary/30 animate-pulse-slow" />
              </div>
              <div className="text-left">
                <h1 className="heading-1 font-mono leading-none">
                  <span className="text-text-primary">Git</span>
                  <span className="gradient-pulse">Pulse</span>
                </h1>
                <p className="text-sm text-text-muted font-mono mt-1">v1.0.0</p>
              </div>
            </div>

            {/* Headline */}
            <h2 className="heading-2 mb-4 text-balance">
              Automate scheduled Git commits on repositories you choose
            </h2>
            <p className="text-lead mb-8 max-w-2xl mx-auto">
              Transparent, user-controlled, and 100% local. No external services, no telemetry,
              no GitHub API calls — just your Git workflow, automated.
            </p>

            {/* Trust Badges Row */}
            <div className="flex flex-wrap items-center justify-center gap-6 mb-10 text-sm text-text-muted">
              <span className="flex items-center gap-1.5 badge badge-success">
                <Check className="h-3 w-3" /> Safe by Default
              </span>
              <span className="flex items-center gap-1.5 badge text-accent-secondary bg-accent-secondary/10" style={{ borderColor: 'rgba(168, 85, 247, 0.3)' }}>
                <Check className="h-3 w-3" /> Local & Private
              </span>
              <span className="flex items-center gap-1.5 badge badge-info">
                <Check className="h-3 w-3" /> Fast & Lightweight
              </span>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <CopyInstallCommand />
              <a
                href="https://github.com/dinalegw/GitPulse"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                <Github className="h-5 w-5" />
                View on GitHub
              </a>
            </div>
          </div>
        </div>

        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-accent-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-72 h-72 bg-accent-secondary/5 rounded-full blur-3xl" />
        </div>
      </header>

      {/* Terminal Demo Section */}
      <section className="py-20 lg:py-28 bg-bg-card/50 border-y border-border-subtle">
        <div className="section-container">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <h3 className="heading-3 mb-3">See it in action</h3>
              <p className="text-text-muted">Real output from <code className="code-inline">gitpulse run --dry-run --count 3</code></p>
            </div>

            <Terminal
              initialOutput={SAMPLE_OUTPUT}
              readOnly
              className="max-w-3xl mx-auto"
            />

            <div className="mt-6 text-center">
              <p className="text-sm text-text-muted">
                Try the live playground →
                <a href="/playground" className="link ml-1">Run GitPulse in your browser</a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why GitPulse Section */}
      <section className="py-20 lg:py-28">
        <div className="section-container">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <h3 className="heading-3 mb-3">Why GitPulse?</h3>
            <p className="text-lead">Built for developers who want automation without compromise</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: '🔒', title: 'Validation First', desc: 'Checks repo state before every run — rejects dirty trees, detached HEAD, bare repos, missing remotes' },
              { icon: '🏠', title: 'Truly Local', desc: 'No network calls except your configured git push. No telemetry, no analytics, no phone home.' },
              { icon: '⚙️', title: 'Human-Readable Config', desc: 'YAML config at ~/.gitpulse/config.yaml — version it, share it, back it up.' },
              { icon: '📦', title: 'Isolated Changes', desc: 'Commits only touch .gitpulse/activity.log — never your source files.' },
              { icon: '⏱️', title: 'Flexible Scheduling', desc: 'Run once, run on a schedule, or dry-run anytime. Full control over timing.' },
              { icon: '🩺', title: 'Built-in Health Checks', desc: '<code className="code-inline">doctor</code>, <code className="code-inline">validate</code>, <code className="code-inline">status</code>, <code className="code-inline">logs</code> — know exactly what\'s happening.' },
            ].map((item, i) => (
              <div key={i} className="card p-6 card-hover">
                <div className="text-3xl mb-3">{item.icon}</div>
                <h4 className="font-semibold text-text-primary mb-2">{item.title}</h4>
                <p className="text-sm text-text-muted leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* One Command. Full Lifecycle. */}
      <section className="py-20 lg:py-28 bg-bg-card/50 border-y border-border-subtle">
        <div className="section-container">
          <div className="max-w-6xl mx-auto text-center mb-12">
            <h3 className="heading-3 mb-3">One Command. Full Lifecycle.</h3>
            <p className="text-lead">Every <code className="code-inline">gitpulse run</code> executes a complete, transparent cycle</p>
          </div>
          <StepDiagram />
        </div>
      </section>

      {/* Responsible Use Callout */}
      <section className="py-20 lg:py-28">
        <div className="section-container">
          <div className="max-w-3xl mx-auto">
            <ResponsibleUseCallout />
          </div>
        </div>
      </section>

      {/* Powerful Commands Grid */}
      <section className="py-20 lg:py-28">
        <div className="section-container">
          <div className="max-w-6xl mx-auto text-center mb-12">
            <h3 className="heading-3 mb-3">Powerful Commands</h3>
            <p className="text-lead">Everything you need to configure, run, and monitor automated commits</p>
          </div>
          <CommandGrid showAll />
        </div>
      </section>

      {/* Quick Install Section */}
      <section className="py-20 lg:py-28 bg-bg-card/50 border-y border-border-subtle">
        <div className="section-container">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <h3 className="heading-3 mb-3">Quick Install</h3>
              <p className="text-lead">Bootstrap installer handles Go, Git, and dependencies automatically</p>
            </div>

            <div className="card p-8">
              <div className="mb-6">
                <p className="text-text-muted mb-3">Linux / macOS:</p>
                <div className="code-block">
                  <pre className="font-mono text-sm"><code>{`git clone https://github.com/dinalegw/GitPulse.git
cd GitPulse
chmod +x scripts/bootstrap.sh
./scripts/bootstrap.sh`}</code></pre>
                </div>
              </div>
              <div className="mb-6">
                <p className="text-text-muted mb-3">Windows PowerShell:</p>
                <div className="code-block">
                  <pre className="font-mono text-sm"><code>{`git clone https://github.com/dinalegw/GitPulse.git
cd GitPulse
Set-ExecutionPolicy -Scope Process Bypass
.\\scripts\\bootstrap.ps1`}</code></pre>
                </div>
              </div>
              <div className="text-center">
                <CopyInstallCommand
                  command="git clone https://github.com/dinalegw/GitPulse.git && cd GitPulse && chmod +x scripts/bootstrap.sh && ./scripts/bootstrap.sh"
                  label="Copy Linux/macOS command"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 border-t border-border-subtle">
        <div className="section-container">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-3">
              <div className="relative">
                <svg className="h-8 w-8" viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="14" stroke="#22c55e" strokeWidth="2" fill="none" />
                  <path d="M16 8v8l5 5" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="16" cy="16" r="6" stroke="#22c55e" strokeWidth="1.5" fill="none" opacity="0.5" />
                </svg>
              </div>
              <span className="font-mono text-xl font-bold">
                <span className="text-text-primary">Git</span>
                <span className="gradient-pulse">Pulse</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-text-muted">
              <a href="https://github.com/dinalegw/GitPulse" target="_blank" rel="noopener noreferrer" className="link">GitHub</a>
              <a href="/docs" className="link">Documentation</a>
              <a href="/playground" className="link">Playground</a>
              <span>MIT License</span>
            </div>

            <PlatformIcons />
          </div>

          <div className="mt-12 text-center text-sm text-text-muted/60">
            <p>Developed by <strong>BLACKSAUCE</strong> — Automate your Git workflow, responsibly.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}