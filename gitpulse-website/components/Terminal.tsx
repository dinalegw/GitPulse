'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface XTermTerminalType {
  write: (data: string) => void;
  writeln: (data: string) => void;
  clear: () => void;
  reset: () => void;
  dispose: () => void;
  cols: number;
  rows: number;
  open: (element: HTMLElement) => void;
  onData: (callback: (data: string) => void) => { dispose: () => void };
  onResize: (callback: (size: { cols: number; rows: number }) => void) => {
    dispose: () => void;
  };
  loadAddon: (addon: unknown) => void;
}

interface TerminalProps {
  className?: string;
  output?: string;
  initialOutput?: string;
  readOnly?: boolean;
  onData?: (data: string) => void;
  onReady?: (terminal: XTermTerminalType) => void;
  onResize?: (cols: number, rows: number) => void;
}

export function Terminal({
  className,
  output,
  initialOutput = '',
  readOnly = false,
  onData,
  onReady,
  onResize,
}: TerminalProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTermTerminalType | null>(null);
  const renderedOutputRef = useRef('');
  const outputRef = useRef(output ?? initialOutput);
  const onDataRef = useRef(onData);
  const onReadyRef = useRef(onReady);
  const onResizeRef = useRef(onResize);
  const readOnlyRef = useRef(readOnly);
  const [loadError, setLoadError] = useState<string | null>(null);

  const desiredOutput = output ?? initialOutput;

  useEffect(() => {
    outputRef.current = desiredOutput;
    const term = terminalRef.current;
    if (!term) return;

    const rendered = renderedOutputRef.current;
    if (desiredOutput === rendered) return;

    if (desiredOutput.startsWith(rendered)) {
      const delta = desiredOutput.slice(rendered.length);
      if (delta) term.write(delta);
    } else {
      term.reset();
      if (desiredOutput) term.write(desiredOutput);
    }
    renderedOutputRef.current = desiredOutput;
  }, [desiredOutput]);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  useEffect(() => {
    if (!mountRef.current || terminalRef.current) return;

    let cancelled = false;
    let handleWindowResize: (() => void) | undefined;
    let dataDisposable: { dispose: () => void } | undefined;
    let resizeDisposable: { dispose: () => void } | undefined;
    let term: XTermTerminalType | null = null;

    void Promise.all([
      import('xterm'),
      import('xterm-addon-fit'),
      import('xterm-addon-web-links'),
    ])
      .then(([xtermModule, fitModule, linksModule]) => {
        if (cancelled || !mountRef.current) return;

        const XTermTerminal = xtermModule.Terminal;
        const fitAddon = new fitModule.FitAddon();
        const linksAddon = new linksModule.WebLinksAddon();

        term = new XTermTerminal({
          cursorBlink: !readOnlyRef.current,
          fontFamily: 'Geist Mono, JetBrains Mono, Fira Code, monospace',
          fontSize: 13,
          lineHeight: 1.5,
          letterSpacing: 0,
          theme: {
            background: '#0a0e14',
            foreground: '#f9fafb',
            cursor: '#22c55e',
            cursorAccent: '#0a0e14',
            black: '#1f2937',
            red: '#ef4444',
            green: '#22c55e',
            yellow: '#fbbf24',
            blue: '#3b82f6',
            magenta: '#a855f7',
            cyan: '#06b6d4',
            white: '#e5e7eb',
            brightBlack: '#374151',
            brightRed: '#f87171',
            brightGreen: '#4ade80',
            brightYellow: '#fde047',
            brightBlue: '#60a5fa',
            brightMagenta: '#c084fc',
            brightCyan: '#22d3ee',
            brightWhite: '#f9fafb',
          },
          allowProposedApi: true,
          convertEol: true,
        }) as XTermTerminalType;

        term.loadAddon(fitAddon);
        term.loadAddon(linksAddon);
        term.open(mountRef.current);

        terminalRef.current = term;

        const fit = () => {
          if (cancelled || !terminalRef.current) return;
          try {
            fitAddon.fit();
          } catch {
            return;
          }
          const current = terminalRef.current;
          onResizeRef.current?.(current.cols, current.rows);
        };

        handleWindowResize = fit;
        window.addEventListener('resize', fit);

        resizeDisposable = term.onResize((size) => {
          onResizeRef.current?.(size.cols, size.rows);
        });

        if (!readOnlyRef.current) {
          dataDisposable = term.onData((data) => {
            onDataRef.current?.(data);
          });
        }

        const initial = outputRef.current;
        if (initial) term.write(initial);
        renderedOutputRef.current = initial;

        requestAnimationFrame(fit);
        onReadyRef.current?.(term);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Terminal failed to load'
          );
        }
      });

    return () => {
      cancelled = true;
      if (handleWindowResize) {
        window.removeEventListener('resize', handleWindowResize);
      }
      dataDisposable?.dispose();
      resizeDisposable?.dispose();
      term?.dispose();
      terminalRef.current = null;
      renderedOutputRef.current = '';
    };
  }, []);

  return (
    <div
      className={cn('terminal-window', 'font-mono', className)}
      style={{ minHeight: '300px', height: '100%' }}
    >
      <div className="terminal-titlebar">
        <div className="terminal-dots" aria-hidden="true">
          <span className="terminal-dot terminal-dot-red" />
          <span className="terminal-dot terminal-dot-yellow" />
          <span className="terminal-dot terminal-dot-green" />
        </div>
        <div className="terminal-title">gitpulse</div>
      </div>

      {loadError ? (
        <pre
          className="terminal-body overflow-auto whitespace-pre-wrap p-4 text-sm"
          style={{ height: 'calc(100% - 40px)' }}
          role="log"
          aria-label="GitPulse terminal output"
        >
          {desiredOutput || `Terminal unavailable: ${loadError}`}
        </pre>
      ) : (
        <div
          ref={mountRef}
          className="terminal-body"
          style={{ height: 'calc(100% - 40px)' }}
          aria-hidden="true"
        />
      )}

      <pre className="sr-only" role="log" aria-live="polite" aria-label="GitPulse terminal output">
        {desiredOutput}
      </pre>
    </div>
  );
}

export function useTerminal() {
  const terminalRef = useRef<XTermTerminalType | null>(null);

  const setTerminal = useCallback((term: XTermTerminalType | null) => {
    terminalRef.current = term;
  }, []);

  const write = useCallback((data: string) => {
    terminalRef.current?.write(data);
  }, []);

  const writeln = useCallback((data: string) => {
    terminalRef.current?.writeln(data);
  }, []);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const reset = useCallback(() => {
    terminalRef.current?.reset();
  }, []);

  return { terminal: terminalRef.current, write, writeln, clear, reset, setTerminal };
}
