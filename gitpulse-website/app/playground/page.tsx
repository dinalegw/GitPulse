'use client';

export const dynamic = 'force-dynamic';

import dynamicImport from 'next/dynamic';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createNdjsonParser } from '@/lib/playground-stream';
import { Button } from '@/components/ui/Button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { PLAYGROUND_COMMANDS } from '@/lib/commands';
import {
  PLAYGROUND_STATES,
  isActive,
  isTerminal,
  type PlaygroundState,
} from '@/lib/playground-state';
import {
  Loader2,
  Terminal as TerminalIcon,
  AlertCircle,
  CheckCircle,
  XCircle,
  Timer,
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const Terminal = dynamicImport(
  () => import('@/components/Terminal').then((mod) => mod.Terminal),
  {
    ssr: false,
    loading: () => (
      <div
        className="terminal-window font-mono animate-pulse"
        style={{ minHeight: '300px' }}
      >
        <div className="terminal-titlebar">
          <div className="terminal-dots" aria-hidden="true">
            <span className="terminal-dot terminal-dot-red" />
            <span className="terminal-dot terminal-dot-yellow" />
            <span className="terminal-dot terminal-dot-green" />
          </div>
          <div className="terminal-title">gitpulse</div>
        </div>
        <div className="terminal-body h-[260px]" />
      </div>
    ),
  }
);

interface PlaygroundCommandOption {
  value: string;
  label: string;
  description: string;
  defaultArgs: string[];
}

interface PlaygroundResponse {
  runId?: string;
  state?: PlaygroundState;
  lifecycleState?: PlaygroundState;
  resultState?: PlaygroundState;
  output?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
  cleanupWarning?: string;
}

interface PlaygroundTimings {
  validationMs?: number;
  rateLimitMs?: number;
  claimMs?: number;
  sandboxCreateMs?: number;
  runtimeVerifyMs?: number;
  scratchRepoMs?: number;
  executionMs?: number;
  cleanupMs?: number;
  totalMs?: number;
  totalServerMs?: number;
  usedSnapshot?: boolean;
}

interface PlaygroundStreamEvent extends PlaygroundResponse {
  type: 'state' | 'progress' | 'stdout' | 'stderr' | 'error' | 'result';
  data?: string;
  message?: string;
  stage?: string;
  cleanupState?: PlaygroundState;
  timings?: PlaygroundTimings;
}

const COMMAND_OPTIONS: PlaygroundCommandOption[] = PLAYGROUND_COMMANDS.map((cmd) => ({
  value: cmd.name,
  label: `gitpulse ${cmd.name}`,
  description: cmd.description,
  defaultArgs: cmd.playground.defaultArgs || [],
}));

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;
  let started = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      started = true;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      started = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      started = true;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (started) {
        tokens.push(current);
        current = '';
        started = false;
      }
      continue;
    }

    current += char;
    started = true;
  }

  if (escaping) current += '\\';
  if (quote) throw new Error('Unclosed quote in arguments');
  if (started) tokens.push(current);

  return tokens;
}

function statusLabel(state: PlaygroundState): string {
  switch (state) {
    case 'QUEUED':
      return 'Starting sandbox';
    case 'STARTING':
      return 'Starting sandbox';
    case 'RUNNING':
      return 'Running';
    case 'SUCCEEDED':
      return 'Succeeded';
    case 'FAILED':
      return 'Failed';
    case 'TIMED_OUT':
      return 'Timed out';
    case 'CANCELLED':
      return 'Cancelled';
    case 'START_FAILED':
      return 'Failed to start';
    case 'CLEANUP':
      return 'Cleaning up';
    case 'CLEANUP_FAILED':
      return 'Cleanup failed';
    case 'DISPOSED':
      return 'Ready';
    default:
      return state;
  }
}

function PlaygroundContent() {
  const searchParams = useSearchParams();
  const [selectedCommand, setSelectedCommand] = useState<string>('run');
  const [args, setArgs] = useState<string>('');
  const [state, setState] = useState<PlaygroundState>('DISPOSED');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [output, setOutput] = useState<string>('');
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [timings, setTimings] = useState<PlaygroundTimings | null>(null);
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey());
  const requestInFlightRef = useRef(false);
  const outputRef = useRef('');
  const streamedStdoutRef = useRef('');
  const streamedStderrRef = useRef('');

  useEffect(() => {
    const cmdParam = searchParams.get('cmd');
    const argsParam = searchParams.get('args');
    const validCmd = cmdParam
      ? COMMAND_OPTIONS.find((cmd) => cmd.value === cmdParam)
      : COMMAND_OPTIONS.find((cmd) => cmd.value === 'run');

    if (!validCmd) return;

    setSelectedCommand(validCmd.value);
    setArgs(argsParam ?? validCmd.defaultArgs.join(' '));
  }, [searchParams]);

  const replaceOutput = (value: string) => {
    outputRef.current = value;
    setOutput(value);
  };

  const appendOutput = (value: string) => {
    if (!value) return;
    outputRef.current += value;
    setOutput(outputRef.current);
  };

  const handleCommandChange = (value: string) => {
    const next = COMMAND_OPTIONS.find((cmd) => cmd.value === value);
    setSelectedCommand(value);
    setArgs(next?.defaultArgs.join(' ') ?? '');
    replaceOutput('');
    setError(null);
    setProgressMessage(null);
    setTimings(null);
    setSessionId(null);
    setState('DISPOSED');
  };

  const handleRun = async (freshExecution = false) => {
    if (requestInFlightRef.current || isActive(state)) return;
    requestInFlightRef.current = true;

    if (freshExecution) {
      idempotencyKeyRef.current = newIdempotencyKey();
    }

    setError(null);
    setProgressMessage('Starting request…');
    setTimings(null);
    streamedStdoutRef.current = '';
    streamedStderrRef.current = '';

    const newSessionId = `session_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 11)}`;
    setSessionId(newSessionId);

    let parsedArgs: string[];
    try {
      parsedArgs = tokenizeArgs(args);
    } catch (parseError) {
      setState('FAILED');
      setError(
        parseError instanceof Error ? parseError.message : 'Invalid arguments'
      );
      setProgressMessage(null);
      requestInFlightRef.current = false;
      return;
    }

    const commandLine = `$ gitpulse ${selectedCommand}${
      parsedArgs.length ? ` ${parsedArgs.join(' ')}` : ''
    }\n\n`;
    replaceOutput(commandLine);

    try {
      setState('QUEUED');

      const response = await fetch('/api/playground/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: newSessionId,
          command: selectedCommand,
          args: parsedArgs,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('application/x-ndjson')) {
        let data: PlaygroundResponse = {};
        try {
          data = (await response.json()) as PlaygroundResponse;
        } catch {
          throw new Error(
            `Playground returned HTTP ${response.status} without a valid response`
          );
        }
        const message =
          data.error ||
          data.cleanupWarning ||
          `Playground request failed with HTTP ${response.status}`;
        setState(data.state ?? 'FAILED');
        setError(message);
        setProgressMessage(null);
        return;
      }

      if (!response.body) {
        throw new Error('Playground response stream is unavailable');
      }

      const decoder = new TextDecoder();
      let finalResultSeen = false;

      const parser = createNdjsonParser((rawEvent: unknown) => {
        const event = rawEvent as PlaygroundStreamEvent;

        if (event.type === 'state' && event.state) {
          setState(event.state);
          return;
        }

        if (event.type === 'progress') {
          if (event.message) setProgressMessage(event.message);
          return;
        }

        if (event.type === 'stdout' && typeof event.data === 'string') {
          streamedStdoutRef.current += event.data;
          appendOutput(event.data);
          return;
        }

        if (event.type === 'stderr' && typeof event.data === 'string') {
          streamedStderrRef.current += event.data;
          appendOutput(event.data);
          return;
        }

        if (event.type === 'error') {
          if (event.message) setError(event.message);
          return;
        }

        if (event.type === 'result') {
          finalResultSeen = true;
          setTimings(event.timings ?? null);
          setProgressMessage(null);

          if (
            event.output &&
            event.output.startsWith(streamedStdoutRef.current)
          ) {
            appendOutput(event.output.slice(streamedStdoutRef.current.length));
            streamedStdoutRef.current = event.output;
          }
          if (
            event.stderr &&
            event.stderr.startsWith(streamedStderrRef.current)
          ) {
            appendOutput(event.stderr.slice(streamedStderrRef.current.length));
            streamedStderrRef.current = event.stderr;
          }

          const finalState =
            event.cleanupWarning || event.cleanupState === 'CLEANUP_FAILED'
              ? 'CLEANUP_FAILED'
              : event.resultState ?? event.state ?? 'FAILED';
          setState(finalState);

          if (event.cleanupWarning) {
            setError(
              `Command ${event.resultState === 'SUCCEEDED' ? 'succeeded' : 'finished'}, but sandbox cleanup failed: ${event.cleanupWarning}`
            );
          } else if (
            event.resultState &&
            event.resultState !== 'SUCCEEDED'
          ) {
            setError(
              event.error ||
                (typeof event.exitCode === 'number'
                  ? `Command exited with code ${event.exitCode}`
                  : 'Playground command failed')
            );
          } else {
            setError(null);
          }
        }
      });

      const reader = response.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.push(decoder.decode());
      parser.finish();

      if (!finalResultSeen) {
        throw new Error('Playground stream ended before the final result');
      }
    } catch (requestError) {
      setState((current) => (isActive(current) ? 'FAILED' : current));
      setProgressMessage(null);
      setError(
        requestError instanceof Error ? requestError.message : 'Unknown error'
      );
    } finally {
      requestInFlightRef.current = false;
    }
  };

  const handleClear = () => {
    replaceOutput('');
    streamedStdoutRef.current = '';
    streamedStderrRef.current = '';
    setError(null);
    setTimings(null);
  };

  const handleRunAgain = () => {
    void handleRun(true);
  };

  const runInFlight = isActive(state);
  const canRunAgain =
    Boolean(sessionId) && (isTerminal(state) || state === 'DISPOSED');

  const renderRunButton = () => {
    if (
      state === 'QUEUED' ||
      state === 'STARTING' ||
      state === 'RUNNING' ||
      state === 'CLEANUP'
    ) {
      return (
        <>
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
          {statusLabel(state)}…
        </>
      );
    }

    if (
      state === 'SUCCEEDED' ||
      (state === 'DISPOSED' && sessionId) ||
      state === 'FAILED' ||
      state === 'TIMED_OUT' ||
      state === 'CANCELLED' ||
      state === 'START_FAILED' ||
      state === 'CLEANUP_FAILED'
    ) {
      return (
        <>
          <TerminalIcon aria-hidden="true" className="h-5 w-5" />
          Run Again
        </>
      );
    }

    return (
      <>
        <TerminalIcon aria-hidden="true" className="h-5 w-5" />
        Run
      </>
    );
  };

  const statusBadge = (() => {
    if (state === 'RUNNING' || state === 'QUEUED' || state === 'STARTING') {
      return 'bg-accent-primary/20 text-accent-primary';
    }
    if (state === 'SUCCEEDED') return 'bg-green-500/20 text-green-400';
    if (
      state === 'FAILED' ||
      state === 'START_FAILED' ||
      state === 'CLEANUP_FAILED'
    ) {
      return 'bg-red-500/20 text-red-400';
    }
    if (state === 'TIMED_OUT') return 'bg-amber-500/20 text-amber-400';
    if (state === 'CANCELLED') return 'bg-zinc-500/20 text-zinc-400';
    return 'bg-border-subtle text-text-muted';
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="py-12 lg:py-16 border-b border-border-subtle">
        <div className="section-container">
          <div className="max-w-6xl mx-auto">
            <nav
              className="flex items-center gap-2 text-sm text-text-muted mb-6"
              aria-label="Breadcrumb"
            >
              <Link
                href="/"
                className="hover:text-text-primary transition-colors"
              >
                Home
              </Link>
              <TerminalIcon aria-hidden="true" className="h-4 w-4" />
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
                  <TerminalIcon aria-hidden="true" className="h-5 w-5 text-accent-primary" />
                  Select Command
                </CardTitle>
                <CardDescription>
                  Choose a GitPulse command to run safely inside a disposable
                  Vercel Sandbox.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <Select
                    value={selectedCommand}
                    onChange={(e) => handleCommandChange(e.target.value)}
                    disabled={runInFlight}
                  >
                    <SelectTrigger className="w-full sm:w-[300px]">
                      <SelectValue placeholder="Select a command..." />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMAND_OPTIONS.map((cmd) => (
                        <SelectItem key={cmd.value} value={cmd.value}>
                          <div className="flex flex-col gap-1">
                            <span className="font-mono text-sm">{cmd.label}</span>
                            <span className="text-xs text-text-muted">
                              {cmd.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex-1 min-w-0">
                    <label className="block text-sm text-text-muted mb-1">
                      Arguments (allow-listed only)
                    </label>
                    <input
                      type="text"
                      value={args}
                      onChange={(e) => setArgs(e.target.value)}
                      className="input-field font-mono text-sm"
                      placeholder="e.g. --dry-run --count 2"
                      disabled={runInFlight}
                    />
                  </div>

                  <Button
                    onClick={canRunAgain ? handleRunAgain : () => void handleRun()}
                    disabled={runInFlight}
                    size="lg"
                    className="whitespace-nowrap"
                  >
                    {renderRunButton()}
                  </Button>

                  {(isTerminal(state) || state === 'DISPOSED') && output && (
                    <Button variant="ghost" onClick={handleClear} size="sm">
                      Clear Output
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {(state === 'QUEUED' ||
              state === 'STARTING' ||
              state === 'RUNNING' ||
              state === 'CLEANUP') && (
              <Card className="mb-6 border-accent-primary/30 bg-accent-primary/5">
                <CardContent className="flex items-center gap-3 text-accent-primary">
                  <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                  <span className="font-medium">
                    {progressMessage || statusLabel(state)}
                  </span>
                </CardContent>
              </Card>
            )}

            {state === 'TIMED_OUT' && (
              <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
                <CardContent className="flex items-center gap-3 text-amber-300">
                  <Timer aria-hidden="true" className="h-5 w-5" />
                  <span>
                    Sandbox execution exceeded the maximum time. The session was
                    disposed. Click Run Again for a fresh sandbox.
                  </span>
                </CardContent>
              </Card>
            )}

            {state === 'CANCELLED' && (
              <Card className="mb-6 border-zinc-500/30 bg-zinc-500/5">
                <CardContent className="flex items-center gap-3 text-zinc-300">
                  <Ban aria-hidden="true" className="h-5 w-5" />
                  <span>Execution was cancelled and the sandbox was disposed.</span>
                </CardContent>
              </Card>
            )}

            {error && (
              <Card className="mb-6 border-red-500/30 bg-red-500/5">
                <CardContent className="flex items-center gap-3 text-red-400">
                  <XCircle aria-hidden="true" className="h-5 w-5" />
                  <span>{error}</span>
                </CardContent>
              </Card>
            )}

            {state === 'SUCCEEDED' && !error && (
              <Card className="mb-6 border-accent-primary/30 bg-accent-primary/5">
                <CardContent className="flex items-center gap-3 text-accent-primary">
                  <CheckCircle aria-hidden="true" className="h-5 w-5" />
                  <span className="font-medium">
                    Command completed successfully
                    {typeof timings?.totalServerMs === 'number' && (
                      <span className="ml-2 text-sm font-normal text-text-muted">
                        {(timings.totalServerMs / 1000).toFixed(1)}s · sandbox disposed
                      </span>
                    )}
                  </span>
                </CardContent>
              </Card>
            )}

            <Card className="h-[500px] lg:h-[600px] flex flex-col overflow-hidden">
              <CardHeader className="flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <TerminalIcon aria-hidden="true" className="h-5 w-5 text-accent-primary" />
                    Terminal Output
                  </CardTitle>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-0.5 rounded',
                        statusBadge
                      )}
                    >
                      {(state === 'RUNNING' ||
                        state === 'QUEUED' ||
                        state === 'STARTING') && (
                        <span className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
                      )}
                      {statusLabel(state)}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-0 min-h-0">
                <Terminal
                  readOnly
                  output={output}
                  className="h-full"
                />
              </CardContent>
            </Card>

            <Card className="mt-6 border-amber-500/30 bg-amber-500/5">
              <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <AlertCircle aria-hidden="true" className="h-5 w-5 text-amber-400 flex-shrink-0" />
                <div className="text-sm text-text-muted">
                  <p className="font-medium text-amber-300 mb-1">
                    Disposable Sandbox Notice
                  </p>
                  <p>
                    Each command runs in a new ephemeral Vercel Sandbox with a
                    scratch Git repository. A local bare repository acts as
                    &ldquo;origin&rdquo;; no real GitHub credentials are injected.
                    The sandbox is deleted after each run.
                  </p>
                  <p className="mt-2 text-xs text-text-muted/80">
                    Commands are allow-listed and the execution window is capped.
                  </p>
                </div>
              </CardContent>
            </Card>

            <details className="mt-4 text-xs text-text-muted">
              <summary className="cursor-pointer">Execution state machine</summary>
              <ul className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1 list-disc list-inside">
                {PLAYGROUND_STATES.map((item) => (
                  <li
                    key={item}
                    className={cn(
                      item === state && 'text-accent-primary font-medium'
                    )}
                  >
                    {item}
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
            Powered by{' '}
            <a
              href="https://vercel.com/docs/vercel-sandbox"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Vercel Sandbox
            </a>{' '}
            ·{' '}
            <a
              href="https://github.com/dinalegw/GitPulse"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              GitPulse source
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function PlaygroundPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col">
          <header className="py-12 lg:py-16 border-b border-border-subtle">
            <div className="section-container">
              <div className="max-w-6xl mx-auto">
                <nav
                  className="flex items-center gap-2 text-sm text-text-muted mb-6"
                  aria-label="Breadcrumb"
                >
                  <Link
                    href="/"
                    className="hover:text-text-primary transition-colors"
                  >
                    Home
                  </Link>
                  <TerminalIcon aria-hidden="true" className="h-4 w-4" />
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
                      <TerminalIcon aria-hidden="true" className="h-5 w-5 text-accent-primary" />
                      Terminal Output
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 p-0 min-h-0">
                    <div
                      className="terminal-window font-mono animate-pulse"
                      style={{ height: '100%', minHeight: '460px' }}
                    >
                      <div className="terminal-titlebar">
                        <div className="terminal-dots" aria-hidden="true">
                          <span className="terminal-dot terminal-dot-red" />
                          <span className="terminal-dot terminal-dot-yellow" />
                          <span className="terminal-dot terminal-dot-green" />
                        </div>
                        <div className="terminal-title">gitpulse</div>
                      </div>
                      <div
                        className="terminal-body"
                        style={{ height: 'calc(100% - 40px)' }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </main>
        </div>
      }
    >
      <PlaygroundContent />
    </Suspense>
  );
}
