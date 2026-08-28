'use client';

import { CommandMeta } from '@/lib/commands';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Copy, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface DocsPageProps {
  command: CommandMeta;
}

export function DocsPage({ command }: DocsPageProps) {
  const copyCommand = () => {
    navigator.clipboard.writeText(`gitpulse ${command.name}`);
  };

  const copyFullCommand = (args: string[] = command.playground.defaultArgs || []) => {
    navigator.clipboard.writeText(`gitpulse ${command.name} ${args.join(' ')}`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="py-16 lg:py-24 border-b border-border-subtle">
        <div className="section-container">
          <div className="max-w-4xl mx-auto">
            <nav className="flex items-center gap-2 text-sm text-text-muted mb-6" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-text-primary transition-colors">Home</Link>
              <ChevronRight className="h-4 w-4" />
              <Link href="/docs" className="hover:text-text-primary transition-colors">Docs</Link>
              <ChevronRight className="h-4 w-4" />
              <span className="font-mono text-text-primary">gitpulse {command.name}</span>
            </nav>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="heading-1 font-mono mb-2">
                  gitpulse <span className="gradient-pulse">{command.name}</span>
                </h1>
                <p className="text-lead">{command.description}</p>
              </div>
              <Button variant="ghost" onClick={copyCommand} aria-label="Copy command">
                <Copy className="h-4 w-4 mr-1" />
                Copy command
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 py-16 lg:py-24">
        <div className="section-container">
          <div className="max-w-4xl mx-auto space-y-12">
            {/* Long Description */}
            {command.longDescription && (
              <section>
                <p className="text-body leading-relaxed">{command.longDescription}</p>
              </section>
            )}

            {/* Flags */}
            {command.flags.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-6">
                  <h2 className="heading-3">Flags</h2>
                  <span className="badge badge-info">{command.flags.length} flags</span>
                </div>
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border-subtle bg-bg-primary">
                            <th className="px-6 py-3 text-left font-mono text-sm text-text-muted uppercase tracking-wider">Flag</th>
                            <th className="px-6 py-3 text-left font-mono text-sm text-text-muted uppercase tracking-wider">Type</th>
                            <th className="px-6 py-3 text-left text-text-muted uppercase tracking-wider">Description</th>
                            <th className="px-6 py-3 text-left text-text-muted uppercase tracking-wider">Default</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle/50">
                          {command.flags.map((flag) => (
                            <tr key={flag.name} className="hover:bg-bg-primary/50 transition-colors">
                              <td className="px-6 py-4 font-mono text-sm text-text-primary">
                                <code className="code-inline">{flag.name}</code>
                              </td>
                              <td className="px-6 py-4">
                                <span className={cn(
                                  'badge text-xs',
                                  flag.type === 'boolean' && 'badge-success',
                                  flag.type === 'number' && 'badge-warning',
                                  flag.type === 'string' && 'badge-info'
                                )}>
                                  {flag.type}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-text-muted">{flag.description}</td>
                              <td className="px-6 py-4 font-mono text-sm text-text-muted">
                                {flag.default !== undefined ? String(flag.default) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Sample Output */}
            {command.sampleOutput && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="heading-3">Sample Output</h2>
                  <Button variant="ghost" size="sm" onClick={() => copyFullCommand()} aria-label="Copy sample command">
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
                <div className="terminal-window">
                  <div className="terminal-titlebar">
                    <div className="terminal-dots">
                      <span className="terminal-dot terminal-dot-red" />
                      <span className="terminal-dot terminal-dot-yellow" />
                      <span className="terminal-dot terminal-dot-green" />
                    </div>
                    <div className="terminal-title">gitpulse {command.name}</div>
                  </div>
                  <pre className="terminal-body font-mono text-sm leading-relaxed whitespace-pre-wrap text-text-primary">
                    {command.sampleOutput}
                  </pre>
                </div>
              </section>
            )}

            {/* Playground Link (if allowed) */}
            {command.playground.allowed && (
              <section>
                <Card className="border-accent-primary/30 bg-accent-primary/5">
                  <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-text-primary mb-1">Try it live</h3>
                      <p className="text-sm text-text-muted">
                        Run <code className="code-inline">gitpulse {command.name}</code> in a disposable sandbox — no installation needed.
                      </p>
                    </div>
                    <Link
                      href={`/playground?cmd=${command.name}&args=${encodeURIComponent((command.playground.defaultArgs || []).join(' '))}`}
                      className="btn-primary"
                    >
                      Open in Playground
                      <ExternalLink className="h-4 w-4 ml-1" />
                    </Link>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Related Commands */}
            <section>
              <h2 className="heading-3 mb-6">Related Commands</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { name: 'init', desc: 'Initialize configuration' },
                  { name: 'config', desc: 'Show or update config' },
                  { name: 'run', desc: 'Create and push commits' },
                  { name: 'status', desc: 'Show repo and config status' },
                  { name: 'logs', desc: 'Show recent log entries' },
                  { name: 'validate', desc: 'Validate configuration' },
                  { name: 'doctor', desc: 'Diagnose installation' },
                  { name: 'version', desc: 'Print version' },
                ].filter((c) => c.name !== command.name).map((c) => (
                  <Link
                    key={c.name}
                    href={`/docs/${c.name}`}
                    className="card p-4 card-hover group"
                  >
                    <div className="flex items-center gap-3">
                      <code className="code-inline font-mono text-lg group-hover:text-accent-primary transition-colors">
                        gitpulse {c.name}
                      </code>
                    </div>
                    <p className="text-sm text-text-muted mt-2">{c.desc}</p>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="py-8 border-t border-border-subtle">
        <div className="section-container text-center text-sm text-text-muted">
          <p>GitPulse v{process.env.NEXT_PUBLIC_GITPULSE_VERSION || '1.0.0'} — <a href="https://github.com/dinalegw/GitPulse" target="_blank" rel="noopener noreferrer" className="link">View source on GitHub</a></p>
        </div>
      </footer>
    </div>
  );
}