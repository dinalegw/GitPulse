'use client';

import { ALL_COMMANDS } from '@/lib/commands';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ChevronRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<string, string> = {
  core: 'Core',
  config: 'Configuration',
  run: 'Execution',
  inspect: 'Inspect',
  health: 'Health',
};

const CATEGORY_ORDER = ['core', 'config', 'run', 'inspect', 'health'];

export default function DocsIndexPage() {
  const categorized = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    commands: ALL_COMMANDS.filter((c) => c.category === cat),
  }));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="py-16 lg:py-24 border-b border-border-subtle">
        <div className="section-container">
          <div className="max-w-4xl mx-auto">
            <nav className="flex items-center gap-2 text-sm text-text-muted mb-6" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-text-primary transition-colors">Home</Link>
              <ChevronRight className="h-4 w-4" />
              <span className="font-mono text-text-primary">Documentation</span>
            </nav>

            <div className="text-center">
              <h1 className="heading-1 font-mono mb-4">
                <span className="text-text-primary">Documentation</span>
              </h1>
              <p className="text-lead max-w-2xl mx-auto">
                Complete reference for every GitPulse command — flags, examples, and sample output.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 py-16 lg:py-24">
        <div className="section-container">
          <div className="max-w-6xl mx-auto space-y-16">
            {categorized.map(({ category, label, commands }) => (
              commands.length > 0 && (
                <section key={category}>
                  <div className="flex items-center gap-3 mb-8">
                    <h2 className="heading-3">{label}</h2>
                    <span className="badge badge-info">{commands.length} commands</span>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {commands.map((cmd) => (
                      <Card key={cmd.name} hover padding="md" className="group">
                        <CardHeader>
                          <div className="flex items-center gap-3 mb-3">
                            <Link href={`/docs/${cmd.name.replace('run-schedule', 'run/schedule')}`} className="flex items-center gap-2">
                              <code className="code-inline font-mono text-lg group-hover:text-accent-primary transition-colors">
                                gitpulse {cmd.name}
                              </code>
                              <ChevronRight className="h-4 w-4 text-text-muted group-hover:text-accent-primary transition-colors" />
                            </Link>
                          </div>
                          <CardDescription className="text-base">{cmd.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-col gap-3">
                            <Link
                              href={`/docs/${cmd.name.replace('run-schedule', 'run/schedule')}`}
                              className="btn-primary w-full text-center"
                            >
                              View Documentation
                              <ExternalLink className="h-4 w-4" />
                            </Link>

                            {cmd.playground.allowed && (
                              <Link
                                href={`/playground?cmd=${cmd.name}&args=${encodeURIComponent((cmd.playground.defaultArgs || []).join(' '))}`}
                                className="btn-secondary w-full text-center"
                              >
                                Try in Playground
                              </Link>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              )
            ))}

            {/* Quick Links */}
            <section className="border-t border-border-subtle pt-12">
              <h2 className="heading-3 mb-6">Quick Links</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Link href="/playground" className="card p-6 card-hover text-center">
                  <div className="text-3xl mb-3">▶</div>
                  <h3 className="font-semibold text-text-primary mb-1">Playground</h3>
                  <p className="text-sm text-text-muted">Run GitPulse live in a sandbox</p>
                </Link>
                <Link href="https://github.com/dinalegw/GitPulse" target="_blank" rel="noopener noreferrer" className="card p-6 card-hover text-center">
                  <ExternalLink className="h-8 w-8 mx-auto mb-3 text-text-muted" />
                  <h3 className="font-semibold text-text-primary mb-1">GitHub Repository</h3>
                  <p className="text-sm text-text-muted">Source code, issues, releases</p>
                </Link>
                <Link href="https://github.com/dinalegw/GitPulse/releases" target="_blank" rel="noopener noreferrer" className="card p-6 card-hover text-center">
                  <div className="text-3xl mb-3">⬇</div>
                  <h3 className="font-semibold text-text-primary mb-1">Releases</h3>
                  <p className="text-sm text-text-muted">Download pre-built binaries</p>
                </Link>
                <Link href="https://github.com/dinalegw/GitPulse/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer" className="card p-6 card-hover text-center">
                  <div className="text-3xl mb-3">🛡</div>
                  <h3 className="font-semibold text-text-primary mb-1">Security Policy</h3>
                  <p className="text-sm text-text-muted">Report vulnerabilities responsibly</p>
                </Link>
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="py-8 border-t border-border-subtle">
        <div className="section-container text-center text-sm text-text-muted">
          <p>GitPulse v1.0.0 — <a href="https://github.com/dinalegw/GitPulse" target="_blank" rel="noopener noreferrer" className="link">View source on GitHub</a></p>
        </div>
      </footer>
    </div>
  );
}