'use client';

import dynamicImport from 'next/dynamic';
import { CommandGrid } from '@/components/CommandGrid';
import { CopyInstallCommand } from '@/components/CopyInstallCommand';
import { ResponsibleUseCallout } from '@/components/ResponsibleUseCallout';
import { StepDiagram } from '@/components/StepDiagram';
import { TrustBadges, PlatformIcons } from '@/components/TrustBadges';
import { Github, ArrowRight, Check, Terminal as TerminalIcon } from 'lucide-react';
import Link from 'next/link';

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

function getVersion() {
  return process.env.NEXT_PUBLIC_GITPULSE_VERSION || '1.0.0';
}

export default function HomePage() {
  const version = getVersion();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="relative overflow-hidden pt-20 pb-32 lg:pt-32 lg:pb-40">
        <div className="section-container">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-3 mb-8">
              <div className="relative">
                <svg className="h-14 w-14" viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="14" stroke="#22c55e" strokeWidth="2" fill="none" />
                  <path d="M16 8v8l5 5" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="16" cy="16" r="6" stroke="#22c55e" strokeWidth="1.5" fill="none" opacity="0.5" />
                </svg>
                <div className="absolute inset-0 rounded-full border-2 border-accent-primary/30 animate-pulse-slow" />
              </div>
              <div className="text-left">
                <h1 className="heading-1 font-mono leading-none"><span className="text-text-primary">Git</span><span className="gradient-pulse">Pulse</span></h1>
                <p className="text-sm text-text-muted font-mono mt-1">v{version}</p>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 badge badge-success mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />
              Open-source Git automation for developers
            </div>
            <h2 className="heading-2 mb-4 text-balance">Automate Git workflows without giving up control</h2>
            <p className="text-lead mb-8 max-w-2xl mx-auto">Schedule repository operations, validate state before changes, preview with dry runs, and push only when you choose. GitPulse runs locally on your machine.</p>

            <div className="flex flex-wrap items-center justify-center gap-3 mb-10 text-sm text-text-muted">
              <span className="flex items-center gap-1.5 badge badge-success"><Check className="h-3 w-3" /> Safety checks</span>
              <span className="flex items-center gap-1.5 badge text-accent-secondary bg-accent-secondary/10" style={{ borderColor: 'rgba(168, 85, 247, 0.3)' }}><Check className="h-3 w-3" /> Local & private</span>
              <span className="flex items-center gap-1.5 badge badge-info"><Check className="h-3 w-3" /> Cross-platform</span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
              <CopyInstallCommand />
              <Link href="/playground" className="btn-secondary"><TerminalIcon className="h-5 w-5" /> Try the Playground</Link>
              <a href="https://github.com/dinalegw/GitPulse" target="_blank" rel="noopener noreferrer" className="btn-secondary"><Github className="h-5 w-5" /> View on GitHub</a>
            </div>
            <p className="text-xs text-text-muted">No account required to explore the playground.</p>
          </div>
        </div>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-accent-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-72 h-72 bg-accent-secondary/5 rounded-full blur-3xl" />
        </div>
      </header>

      <section className="py-20 lg:py-28 bg-bg-card/50 border-y border-border-subtle">
        <div className="section-container"><div className="max-w-4xl mx-auto">
          <div className="text-center mb-10"><h3 className="heading-3 mb-3">See it before you install it</h3><p className="text-text-muted">Preview a real GitPulse run, then open the browser playground or install locally.</p></div>
          <Terminal initialOutput={SAMPLE_OUTPUT} readOnly className="max-w-3xl mx-auto" />
          <div className="mt-6 text-center"><Link href="/playground" className="link">Open the live playground →</Link></div>
        </div></div>
      </section>

      <section className="py-20 lg:py-28"><div className="section-container"><div className="max-w-4xl mx-auto text-center mb-16"><h3 className="heading-3 mb-3">Why GitPulse?</h3><p className="text-lead">Automation with guardrails, visibility, and user control.</p></div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: '🔒', title: 'Validation First', desc: 'Checks repository state before a run and rejects unsafe states such as dirty trees, detached HEAD, bare repositories, and missing remotes.' },
            { icon: '🏠', title: 'Local by Design', desc: 'Runs on your machine. GitPulse does not phone home or collect telemetry.' },
            { icon: '⚙️', title: 'Human-Readable Config', desc: 'Simple YAML configuration keeps schedules and repository settings understandable and controllable.' },
            { icon: '📦', title: 'Scoped Changes', desc: 'Automation is designed to keep generated metadata separate from your source files.' },
            { icon: '⏱️', title: 'Flexible Scheduling', desc: 'Run once, schedule recurring runs, or use dry-run mode to preview behavior before changing a repository.' },
            { icon: '🩺', title: 'Built-in Diagnostics', desc: 'Use doctor, validate, status, and logs to understand repository and runtime state.' },
          ].map((item, i) => <div key={i} className="card p-6 card-hover"><div className="text-3xl mb-3">{item.icon}</div><h4 className="font-semibold text-text-primary mb-2">{item.title}</h4><p className="text-sm text-text-muted leading-relaxed">{item.desc}</p></div>)}
        </div>
      </div></section>

      <section className="py-20 lg:py-28 bg-bg-card/50 border-y border-border-subtle"><div className="section-container"><div className="max-w-6xl mx-auto text-center mb-12"><h3 className="heading-3 mb-3">One command. Full lifecycle.</h3><p className="text-lead">See what happens from validation through repository update.</p></div><StepDiagram /></div></section>

      <section className="py-20 lg:py-28"><div className="section-container"><div className="max-w-3xl mx-auto"><ResponsibleUseCallout /></div></div></section>

      <section className="py-20 lg:py-28"><div className="section-container"><div className="max-w-6xl mx-auto text-center mb-12"><h3 className="heading-3 mb-3">Everything in one CLI</h3><p className="text-lead">Configure, run, schedule, inspect, and diagnose from your terminal.</p></div><CommandGrid showAll /></div></section>

      <section className="py-20 lg:py-28 bg-bg-card-2/50 border-y border-border-subtle"><div className="section-container"><div className="max-w-5xl mx-auto"><div className="text-center mb-10"><h3 className="heading-3 mb-3">Choose your path</h3><p className="text-lead">Use GitPulse from a release, or contribute to the open-source project.</p></div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="card p-8"><span className="badge badge-success">USE GITPULSE</span><h4 className="heading-3 mt-3 mb-3">Install the CLI</h4><p className="text-text-muted mb-4 text-sm">The supported installer is in the GitPulse repository. It checks prerequisites, verifies any downloaded Go toolchain, then builds the local CLI.</p><p className="text-text-muted mb-2 text-sm font-medium">Linux / macOS</p><div className="code-block mb-4"><pre className="font-mono text-xs whitespace-pre-wrap break-all"><code>{`git clone https://github.com/dinalegw/GitPulse.git\ncd GitPulse\n./scripts/bootstrap.sh`}</code></pre></div><p className="text-text-muted mb-2 text-sm font-medium">Windows PowerShell</p><div className="code-block mb-4"><pre className="font-mono text-xs whitespace-pre-wrap break-all"><code>{`git clone https://github.com/dinalegw/GitPulse.git\ncd GitPulse\n.\\scripts\\bootstrap.ps1`}</code></pre></div><p className="text-xs text-text-muted/80 mb-4">Then run <code className="code-inline">gitpulse init</code> inside a repository you own.</p><Link href="/playground" className="link text-sm">Or try the playground first →</Link></div>
          <div className="card p-8"><span className="badge text-accent-secondary bg-accent-secondary/10" style={{ borderColor: 'rgba(168, 85, 247, 0.3)' }}>DEVELOP GITPULSE</span><h4 className="heading-3 mt-3 mb-3">Fork and contribute</h4><p className="text-text-muted mb-4 text-sm">Clone the repository when you want to inspect, modify, test, or contribute to GitPulse itself.</p><div className="code-block mb-4"><pre className="font-mono text-xs whitespace-pre-wrap break-all"><code>{`git clone https://github.com/dinalegw/GitPulse.git\ncd GitPulse\n./scripts/bootstrap.sh`}</code></pre></div><p className="text-xs text-text-muted/80">Windows users can run <code className="code-inline">scripts\\bootstrap.ps1</code>. See <Link href="/docs" className="link">developer docs</Link>.</p></div>
        </div>
      </div></div></section>

      <footer className="py-16 border-t border-border-subtle"><div className="section-container"><div className="flex flex-col lg:flex-row items-center justify-between gap-8"><div className="flex items-center gap-3"><div className="relative"><svg className="h-8 w-8" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" stroke="#22c55e" strokeWidth="2" fill="none" /><path d="M16 8v8l5 5" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="16" cy="16" r="6" stroke="#22c55e" strokeWidth="1.5" fill="none" opacity="0.5" /></svg></div><span className="font-mono text-xl font-bold"><span className="text-text-primary">Git</span><span className="gradient-pulse">Pulse</span></span></div><div className="flex flex-wrap items-center justify-center gap-8 text-sm text-text-muted"><a href="https://github.com/dinalegw/GitPulse" target="_blank" rel="noopener noreferrer" className="link">GitHub</a><Link href="/docs" className="link">Documentation</Link><Link href="/playground" className="link">Playground</Link><Link href="/connect" className="link">Connect GitHub</Link><span>MIT License</span></div><PlatformIcons /></div><div className="mt-12 text-center text-sm text-text-muted/60"><p>Developed by <strong>BLACKSAUCE</strong> — Automate your Git workflow, responsibly.</p></div></div></footer>
    </div>
  );
}
