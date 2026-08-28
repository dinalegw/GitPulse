'use client';

export const dynamic = 'force-dynamic';

import dynamicImport from 'next/dynamic';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTerminal } from '@/components/Terminal';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { PLAYGROUND_COMMANDS } from '@/lib/commands';
import { Loader2, Terminal as TerminalIcon, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

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

interface PlaygroundCommandOption {
  value: string;
  label: string;
  description: string;
  requiresInteractive?: boolean;
  defaultArgs: string[];
}

const COMMAND_OPTIONS: PlaygroundCommandOption[] = PLAYGROUND_COMMANDS.map((cmd) => ({
  value: cmd.name,
  label: `gitpulse ${cmd.name}`,
  description: cmd.description,
  requiresInteractive: cmd.playground.requiresInteractive,
  defaultArgs: cmd.playground.defaultArgs || [],
}));

function PlaygroundContent() {
  const searchParams = useSearchParams();
  const [selectedCommand, setSelectedCommand] = useState<string>('quick-wizard');
  const [args, setArgs] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'running' | 'completed' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [output, setOutput] = useState<string>('');
  const [isInteractive, setIsInteractive] = useState(false);
  const terminal = useTerminal();

  const selectedCmd = COMMAND_OPTIONS.find((c) => c.value === selectedCommand);

  // Initialize from query params on mount
  useEffect(() => {
    const cmdParam = searchParams.get('cmd');
    const argsParam = searchParams.get('args');

    if (cmdParam) {
      const validCmd = COMMAND_OPTIONS.find((c) => c.value === cmdParam);
      if (validCmd) {
        setSelectedCommand(cmdParam);
        if (argsParam) {
          setArgs(argsParam);
        } else {
          setArgs(validCmd.defaultArgs.join(' '));
        }
        setIsInteractive(validCmd.requiresInteractive || false);
        return;
      }
    }

    // Fallback to default (quick-wizard)
    setSelectedCommand('quick-wizard');
    const defaultCmd = COMMAND_OPTIONS.find((c) => c.value === 'quick-wizard');
    if (defaultCmd) {
      setArgs(defaultCmd.defaultArgs.join(' '));
      setIsInteractive(defaultCmd.requiresInteractive || false);
    }
  }, [searchParams]);

  // Update args when command changes (manual selection)
  useEffect(() => {
    if (selectedCmd) {
      setArgs(selectedCmd.defaultArgs.join(' '));
      setIsInteractive(selectedCmd.requiresInteractive || false);
    }
  }, [selectedCommand, selectedCmd]);

  const handleRun = async () => {
    setStatus('connecting');
    setError(null);
    setOutput('');
    terminal.clear();

    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    setSessionId(newSessionId);

    try {
      // Start sandbox session via API
      const response = await fetch('/api/playground/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: newSessionId,
          command: selectedCommand,
          args: args.split(' ').filter(Boolean),
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to start sandbox');
      }

      // For interactive commands, we need to handle SSE stream
      if (selectedCmd?.requiresInteractive) {
        setStatus('running');
        setIsInteractive(true);
        await handleInteractiveStream(response);
      } else {
        // Non-interactive: get full response
        const data = await response.json();
        setOutput(data.output || '');
        setStatus(data.exitCode === 0 ? 'completed' : 'error');
        if (data.exitCode !== 0) {
          setError(`Command exited with code ${data.exitCode}`);
        }
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleInteractiveStream = async (response: Response) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) return;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Parse SSE format
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'output') {
                setOutput((prev) => prev + data.content);
                terminal.write(data.content);
              } else if (data.type === 'exit') {
                setStatus(data.code === 0 ? 'completed' : 'error');
                if (data.code !== 0) {
                  setError(`Command exited with code ${data.code}`);
                }
                setIsInteractive(false);
                return;
              } else if (data.type === 'error') {
                setError(data.message);
                setStatus('error');
                setIsInteractive(false);
                return;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stream error');
      setStatus('error');
      setIsInteractive(false);
    }
  };

  const handleSendInput = useCallback((input: string) => {
    if (!sessionId || !isInteractive) return;

    // Send stdin to sandbox
    fetch('/api/playground/input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, input }),
    }).catch(console.error);
  }, [sessionId, isInteractive]);

  const handleTerminalData = useCallback((data: string) => {
    handleSendInput(data);
  }, [handleSendInput]);

  const handleTerminalResize = useCallback((cols: number, rows: number) => {
    if (!sessionId || !isInteractive) return;
    fetch('/api/playground/input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, cols, rows }),
    }).catch(console.error);
  }, [sessionId, isInteractive]);

  const handleStop = async () => {
    if (sessionId) {
      await fetch('/api/playground/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, input: '\x03' }), // Ctrl+C
      });
    }
    setStatus('idle');
    setIsInteractive(false);
  };

  const handleClear = () => {
    terminal.clear();
    setOutput('');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="py-12 lg:py-16 border-b border-border-subtle">
        <div className="section-container">
          <div className="max-w-6xl mx-auto">
            <nav className="flex items-center gap-2 text-sm text-text-muted mb-6" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-text-primary transition-colors">Home</Link>
              <TerminalIcon className="h-4 w-4" />
              <span className="font-mono text-text-primary">Playground</span>
            </nav>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="heading-1 font-mono mb-2">
                  <span className="gradient-pulse">Playground</span>
                </h1>
                <p className="text-lead">
                  Run GitPulse in a disposable sandbox — no installation, no risk
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 py-8 lg:py-12">
        <div className="section-container">
          <div className="max-w-6xl mx-auto">
            {/* Command Selector */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TerminalIcon className="h-5 w-5 text-accent-primary" />
                  Select Command
                </CardTitle>
                <CardDescription>
                  Choose a GitPulse command to run. The interactive wizard ({'gitpulse'}) is the flagship demo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <Select value={selectedCommand} onChange={(e) => setSelectedCommand(e.target.value)}>
                    <SelectTrigger className="w-full sm:w-[300px]">
                      <SelectValue placeholder="Select a command..." />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMAND_OPTIONS.map((cmd) => (
                        <SelectItem key={cmd.value} value={cmd.value}>
                          <div className="flex flex-col gap-1">
                            <span className="font-mono text-sm">{cmd.label}</span>
                            <span className="text-xs text-text-muted">{cmd.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex-1 min-w-0">
                    <label className="block text-sm text-text-muted mb-1">Arguments (allow-listed only)</label>
                    <input
                      type="text"
                      value={args}
                      onChange={(e) => setArgs(e.target.value)}
                      className="input-field font-mono text-sm"
                      placeholder="e.g. --dry-run --count 2"
                      disabled={isInteractive}
                    />
                    {isInteractive && (
                      <p className="text-xs text-accent-primary/80 mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Interactive mode — arguments not used. Type directly in the terminal.
                      </p>
                    )}
                  </div>

                  <Button
                    onClick={handleRun}
                    disabled={status === 'running' || status === 'connecting'}
                    size="lg"
                    className="whitespace-nowrap"
                  >
                    {status === 'connecting' && <Loader2 className="h-5 w-5 animate-spin" />}
                    {status === 'running' && <Loader2 className="h-5 w-5 animate-spin" />}
                    {status === 'idle' || status === 'completed' || status === 'error' ? (
                      <>
                        <TerminalIcon className="h-5 w-5" />
                        {status === 'idle' ? 'Run' : 'Run Again'}
                      </>
                    ) : null}
                  </Button>

                  {(status === 'running' || status === 'completed') && (
                    <Button variant="secondary" onClick={handleStop} disabled={status !== 'running'}>
                      <XCircle className="h-5 w-5" />
                      Stop
                    </Button>
                  )}

                  {status === 'completed' && (
                    <Button variant="ghost" onClick={handleClear} size="sm">
                      Clear Output
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Status & Error */}
            {(status === 'connecting' || status === 'running') && (
              <Card className="mb-6 border-accent-primary/30 bg-accent-primary/5">
                <CardContent className="flex items-center gap-3 text-accent-primary">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="font-medium">
                    {status === 'connecting' ? 'Starting sandbox...' : 'Running command...'}
                  </span>
                  {isInteractive && (
                    <span className="badge badge-success ml-auto">Interactive Mode</span>
                  )}
                </CardContent>
              </Card>
            )}

            {error && (
              <Card className="mb-6 border-red-500/30 bg-red-500/5">
                <CardContent className="flex items-center gap-3 text-red-400">
                  <XCircle className="h-5 w-5" />
                  <span>{error}</span>
                </CardContent>
              </Card>
            )}

            {status === 'completed' && !error && (
              <Card className="mb-6 border-accent-primary/30 bg-accent-primary/5">
                <CardContent className="flex items-center gap-3 text-accent-primary">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Command completed successfully</span>
                </CardContent>
              </Card>
            )}

            {/* Terminal */}
            <Card className="h-[500px] lg:h-[600px] flex flex-col overflow-hidden">
              <CardHeader className="flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <TerminalIcon className="h-5 w-5 text-accent-primary" />
                    Live Terminal
                  </CardTitle>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span className={cn(
                      'flex items-center gap-1.5 px-2 py-0.5 rounded',
                      status === 'running' && 'bg-accent-primary/20 text-accent-primary',
                      status === 'completed' && !error && 'bg-green-500/20 text-green-400',
                      status === 'error' && 'bg-red-500/20 text-red-400',
                      (status === 'idle' || status === 'connecting') && 'bg-border-subtle text-text-muted'
                    )}>
                      {status === 'running' && <span className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />}
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-0 min-h-0">
                <Terminal
                  readOnly={!isInteractive}
                  onData={handleTerminalData}
                  onReady={terminal.setTerminal}
                  onResize={handleTerminalResize}
                  className="h-full"
                />
              </CardContent>
            </Card>

            {/* Sandbox Notice */}
            <Card className="mt-6 border-amber-500/30 bg-amber-500/5">
              <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0" />
                <div className="text-sm text-text-muted">
                  <p className="font-medium text-amber-300 mb-1">Disposable Sandbox Notice</p>
                  <p>
                    This terminal runs in an ephemeral E2B microVM with a scratch Git repository.
                    A local bare repo serves as &ldquo;origin&rdquo; &mdash; no real GitHub credentials or network egress.
                    The sandbox is destroyed after 60 seconds of inactivity.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <footer className="py-8 border-t border-border-subtle">
        <div className="section-container text-center text-sm text-text-muted">
          <p>
            Powered by <a href="https://e2b.dev" target="_blank" rel="noopener noreferrer" className="link">E2B</a> sandboxes ·
            <a href="https://github.com/dinalegw/GitPulse" target="_blank" rel="noopener noreferrer" className="link">GitPulse source</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function PlaygroundPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col">
        <header className="py-12 lg:py-16 border-b border-border-subtle">
          <div className="section-container">
            <div className="max-w-6xl mx-auto">
              <nav className="flex items-center gap-2 text-sm text-text-muted mb-6" aria-label="Breadcrumb">
                <Link href="/" className="hover:text-text-primary transition-colors">Home</Link>
                <TerminalIcon className="h-4 w-4" />
                <span className="font-mono text-text-primary">Playground</span>
              </nav>
              <h1 className="heading-1 font-mono mb-2">
                <span className="gradient-pulse">Playground</span>
              </h1>
            </div>
          </div>
        </header>
        <main className="flex-1 py-8 lg:py-12">
          <div className="section-container">
            <div className="max-w-6xl mx-auto">
              <Card className="h-[500px] lg:h-[600px] flex flex-col overflow-hidden">
                <CardHeader className="flex-shrink-0">
                  <CardTitle className="flex items-center gap-2">
                    <TerminalIcon className="h-5 w-5 text-accent-primary" />
                    Live Terminal
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-0 min-h-0">
                  <div className="terminal-window font-mono animate-pulse" style={{ height: '100%', minHeight: '460px' }}>
                    <div className="terminal-titlebar">
                      <div className="terminal-dots">
                        <span className="terminal-dot terminal-dot-red" />
                        <span className="terminal-dot terminal-dot-yellow" />
                        <span className="terminal-dot terminal-dot-green" />
                      </div>
                      <div className="terminal-title">gitpulse</div>
                    </div>
                    <div className="terminal-body" style={{ height: 'calc(100% - 40px)' }} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    }>
      <PlaygroundContent />
    </Suspense>
  );
}