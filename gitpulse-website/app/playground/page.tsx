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
import {
  PLAYGROUND_STATES,
  isActive,
  isTerminal,
  type PlaygroundState,
} from '@/lib/playground-state';
import { Loader2, Terminal as TerminalIcon, AlertCircle, CheckCircle, XCircle, Timer, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const Terminal = dynamicImport(() => import('@/components/Terminal').then((mod) => mod.Terminal), {
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

function newIdempotencyKey(): string {
  // Cryptographically random per attempt; reused across double-clicks.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function statusLabel(state: PlaygroundState): string {
  switch (state) {
    case 'QUEUED': return 'Queued';
    case 'STARTING': return 'Starting sandbox';
    case 'RUNNING': return 'Running';
    case 'SUCCEEDED': return 'Succeeded';
    case 'FAILED': return 'Failed';
    case 'TIMED_OUT': return 'Timed out';
    case 'CANCELLED': return 'Cancelled';
    case 'START_FAILED': return 'Failed to start';
    case 'CLEANUP': return 'Cleaning up';
    case 'CLEANUP_FAILED': return 'Cleanup failed';
    case 'DISPOSED': return 'Disposed';
    default: return state;
  }
}

function PlaygroundContent() {
  const searchParams = useSearchParams();
  const [selectedCommand, setSelectedCommand] = useState<string>('quick-wizard');
  const [args, setArgs] = useState<string>('');
  const [state, setState] = useState<PlaygroundState>('DISPOSED');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [output, setOutput] = useState<string>('');
  const [isInteractive, setIsInteractive] = useState(false);
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey());
  const terminal = useTerminal();

  const selectedCmd = COMMAND_OPTIONS.find((c) => c.value === selectedCommand);

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
    setSelectedCommand('quick-wizard');
    const defaultCmd = COMMAND_OPTIONS.find((c) => c.value === 'quick-wizard');
    if (defaultCmd) {
      setArgs(defaultCmd.defaultArgs.join(' '));
      setIsInteractive(defaultCmd.requiresInteractive || false);
    }
  }, [searchParams]);

  useEffect(() => {
    if (selectedCmd) {
      setArgs(selectedCmd.defaultArgs.join(' '));
      setIsInteractive(selectedCmd.requiresInteractive || false);
    }
  }, [selectedCommand, selectedCmd]);

  // "Run Again" semantics: a fresh execution requires a fresh idempotency
  // key, a fresh sandbox sessionId, and a state reset. The server will
  // create an entirely new execution; previous executions stay in history.
  const startFreshExecution = useCallback(() => {
    idempotencyKeyRef.current = newIdempotencyKey();
    setSessionId(null);
    setOutput('');
    setError(null);
    terminal.clear();
  }, [terminal]);

  const handleRun = async () => {
    // Click guard: do not send a second POST while one is in flight or
    // while the state machine is in an active state.
    if (isActive(state)) return;
    setError(null);
    setOutput('');
    terminal.clear();
    // Always use a new sessionId; never reuse. Each Run/Run Again is a
    // brand-new sandbox instance on the server.
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    setSessionId(newSessionId);

    try {
      setState('QUEUED');
      const response = await fetch('/api/playground/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: newSessionId,
          command: selectedCommand,
          args: args.split(' ').filter(Boolean),
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });

      if (!response.ok) {
        const err = (await response.json()) as { error?: string; state?: PlaygroundState };
        const status = err.state ?? 'FAILED';
        setState(status);
        throw new Error(err.error ?? 'Failed to start sandbox');
      }

      if (selectedCmd?.requiresInteractive) {
        setIsInteractive(true);
        await handleInteractiveStream(response);
      } else {
        const data = (await response.json()) as { runId: string; state: PlaygroundState; output?: string; stderr?: string; exitCode?: number };
        setState(data.state);
        setOutput(data.output ?? '');
        if (data.state !== 'SUCCEEDED') {
          setError(`Command exited with code ${data.exitCode ?? '?'}`);
        }
      }
    } catch (err) {
      if (state === 'QUEUED') setState('FAILED');
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
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as { type: string; content?: string; code?: number; message?: string };
              if (data.type === 'output' && data.content) {
                setOutput((prev) => prev + data.content!);
                terminal.write(data.content);
              } else if (data.type === 'exit') {
                const next: PlaygroundState = data.code === 0 ? 'SUCCEEDED' : 'FAILED';
                setState(next);
                if (data.code !== 0) setError(`Command exited with code ${data.code}`);
                setIsInteractive(false);
                return;
              } else if (data.type === 'timeout') {
                setState('TIMED_OUT');
                setError('Sandbox execution exceeded the maximum time');
                setIsInteractive(false);
                return;
              } else if (data.type === 'error') {
                setError(data.message ?? 'Execution failed');
                setState('FAILED');
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
      setState('FAILED');
      setIsInteractive(false);
    }
  };

  const handleSendInput = useCallback((input: string) => {
    if (!sessionId || !isInteractive) return;
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
        body: JSON.stringify({ sessionId, input: '\x03' }),
      }).catch(() => undefined);
    }
    setState('CANCELLED');
    setIsInteractive(false);
  };

  const handleClear = () => {
    terminal.clear();
    setOutput('');
    setError(null);
  };

  const handleRunAgain = () => {
    startFreshExecution();
    void handleRun();
  };

  const runInFlight = isActive(state);
  const canRunAgain = isTerminal(state) || state === 'DISPOSED';

  // Compute the button label / icon based on current state. This is the
  // canonical UX surface for the state machine.
  const renderRunButton = () => {
    if (state === 'QUEUED' || state === 'STARTING') {
      return (
        <>
          <Loader2 className="h-5 w-5 animate-spin" />
          Starting…
        </>
      );
    }
    if (state === 'RUNNING') {
      return (
        <>
          <Loader2 className="h-5 w-5 animate-spin" />
          Running…
        </>
      );
    }
    if (state === 'CLEANUP') {
      return (
        <>
          <Loader2 className="h-5 w-5 animate-spin" />
          Cleaning up…
        </>
      );
    }
    if (state === 'SUCCEEDED' || state === 'DISPOSED' || state === 'FAILED' || state === 'TIMED_OUT' || state === 'CANCELLED' || state === 'START_FAILED' || state === 'CLEANUP_FAILED') {
      return (
        <>
          <TerminalIcon className="h-5 w-5" />
          Run Again
        </>
      );
    }
    return (
      <>
        <TerminalIcon className="h-5 w-5" />
        Run
      </>
    );
  };

  const statusBadge = (() => {
    if (state === 'RUNNING') return 'bg-accent-primary/20 text-accent-primary';
    if (state === 'SUCCEEDED' || state === 'DISPOSED') return 'bg-green-500/20 text-green-400';
    if (state === 'FAILED' || state === 'START_FAILED' || state === 'CLEANUP_FAILED') return 'bg-red-500/20 text-red-400';
    if (state === 'TIMED_OUT') return 'bg-amber-500/20 text-amber-400';
    if (state === 'CANCELLED') return 'bg-zinc-500/20 text-zinc-400';
    return 'bg-border-subtle text-text-muted';
  })();

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
                  <Select value={selectedCommand} onChange={(e) => setSelectedCommand(e.target.value)} disabled={runInFlight}>
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
                      disabled={isInteractive || runInFlight}
                    />
                    {isInteractive && (
                      <p className="text-xs text-accent-primary/80 mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Interactive mode — arguments not used. Type directly in the terminal.
                      </p>
                    )}
                  </div>

                  <Button
                    onClick={canRunAgain ? handleRunAgain : handleRun}
                    disabled={runInFlight}
                    size="lg"
                    className="whitespace-nowrap"
                  >
                    {renderRunButton()}
                  </Button>

                  {(state === 'RUNNING' || state === 'STARTING' || state === 'QUEUED') && (
                    <Button variant="secondary" onClick={handleStop}>
                      <XCircle className="h-5 w-5" />
                      Stop
                    </Button>
                  )}

                  {(isTerminal(state) || state === 'DISPOSED') && output && (
                    <Button variant="ghost" onClick={handleClear} size="sm">
                      Clear Output
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {(state === 'QUEUED' || state === 'STARTING' || state === 'RUNNING' || state === 'CLEANUP') && (
              <Card className="mb-6 border-accent-primary/30 bg-accent-primary/5">
                <CardContent className="flex items-center gap-3 text-accent-primary">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="font-medium">{statusLabel(state)}</span>
                  {isInteractive && (
                    <span className="badge badge-success ml-auto">Interactive Mode</span>
                  )}
                </CardContent>
              </Card>
            )}

            {state === 'TIMED_OUT' && (
              <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
                <CardContent className="flex items-center gap-3 text-amber-300">
                  <Timer className="h-5 w-5" />
                  <span>Sandbox execution exceeded the maximum time. The session was disposed. Click Run Again for a fresh sandbox.</span>
                </CardContent>
              </Card>
            )}

            {state === 'CANCELLED' && (
              <Card className="mb-6 border-zinc-500/30 bg-zinc-500/5">
                <CardContent className="flex items-center gap-3 text-zinc-300">
                  <Ban className="h-5 w-5" />
                  <span>Execution cancelled. The sandbox was disposed.</span>
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

            {state === 'SUCCEEDED' && !error && (
              <Card className="mb-6 border-accent-primary/30 bg-accent-primary/5">
                <CardContent className="flex items-center gap-3 text-accent-primary">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Command completed successfully</span>
                </CardContent>
              </Card>
            )}

            <Card className="h-[500px] lg:h-[600px] flex flex-col overflow-hidden">
              <CardHeader className="flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <TerminalIcon className="h-5 w-5 text-accent-primary" />
                    Live Terminal
                  </CardTitle>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded', statusBadge)}>
                      {state === 'RUNNING' && <span className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />}
                      {statusLabel(state)}
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

            <Card className="mt-6 border-amber-500/30 bg-amber-500/5">
              <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0" />
                <div className="text-sm text-text-muted">
                  <p className="font-medium text-amber-300 mb-1">Disposable Sandbox Notice</p>
                  <p>
                    This terminal runs in an ephemeral E2B microVM with a scratch Git repository.
                    A local bare repo serves as &ldquo;origin&rdquo; &mdash; no real GitHub credentials or network egress.
                    Each Run / Run Again creates a brand-new sandbox; previous sessions are disposed.
                  </p>
                  <p className="mt-2 text-xs text-text-muted/80">
                    Resource limits: CPU/memory enforced by E2B; execution time capped at 60s; output size limited by the streaming connection.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* State-machine observability for advanced users / debugging. */}
            <details className="mt-4 text-xs text-text-muted">
              <summary className="cursor-pointer">Execution state machine</summary>
              <ul className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1 list-disc list-inside">
                {PLAYGROUND_STATES.map((s) => (
                  <li key={s} className={cn(s === state && 'text-accent-primary font-medium')}>
                    {s}
                  </li>
                ))}
              </ul>
            </details>
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