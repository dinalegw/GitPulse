'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// Type for xterm Terminal - defined here to avoid importing xterm at top level
// This allows useTerminal hook to work without SSR issues
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
  onResize: (callback: (size: { cols: number; rows: number }) => void) => { dispose: () => void };
  loadAddon: (addon: any) => void;
}

interface TerminalProps {
  className?: string;
  initialOutput?: string;
  readOnly?: boolean;
  onData?: (data: string) => void;
  onReady?: (terminal: XTermTerminalType) => void;
  onResize?: (cols: number, rows: number) => void;
}

export function Terminal({
  className,
  initialOutput = '',
  readOnly = false,
  onData,
  onReady,
  onResize,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTermTerminalType | null>(null);
  const fitAddonRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    let handleResize: () => void;

    // Dynamically import xterm to avoid SSR issues
    import('xterm').then(({ Terminal: XTermTerminal }) => {
      import('xterm-addon-fit').then(({ FitAddon }) => {
        import('xterm-addon-web-links').then(({ WebLinksAddon }) => {
            // Create terminal instance
            const term = new XTermTerminal({
              cursorBlink: true,
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
            });

            // Add fit addon
            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            fitAddonRef.current = fitAddon;

            // Add web links addon
            term.loadAddon(new WebLinksAddon());

            // Open in container
            term.open(containerRef.current!);

            // Handle resize
            handleResize = () => {
              fitAddon.fit();
              // Notify parent of resize for PTY synchronization
              const t = terminalRef.current;
              if (t && onResize) {
                onResize(t.cols, t.rows);
              }
            };

            window.addEventListener('resize', handleResize);
            fitAddon.fit();

            // Also listen to terminal's own resize events (e.g., from fitAddon)
            term.onResize((size) => {
              if (onResize) {
                onResize(size.cols, size.rows);
              }
            });

            // Write initial output
            if (initialOutput) {
              term.write(initialOutput);
            }

            // Handle input if not read-only
            if (!readOnly && onData) {
              term.onData((data) => {
                onData(data);
              });
            }

            terminalRef.current = term;
            setIsReady(true);
            onReady?.(term);
        });
      });
    });

    return () => {
      if (handleResize) {
        window.removeEventListener('resize', handleResize);
      }
      terminalRef.current?.dispose();
      terminalRef.current = null;
      setIsReady(false);
    };
  }, [initialOutput, readOnly, onData, onReady, onResize]);

  // Public method to write to terminal
  const write = (data: string) => {
    terminalRef.current?.write(data);
  };

  // Public method to clear terminal
  const clear = () => {
    terminalRef.current?.clear();
  };

  // Public method to reset terminal
  const reset = () => {
    terminalRef.current?.reset();
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'terminal-window',
        'font-mono',
        className
      )}
      style={{ minHeight: '300px', height: '100%' }}
    >
      <div className="terminal-titlebar">
        <div className="terminal-dots">
          <span className="terminal-dot terminal-dot-red" />
          <span className="terminal-dot terminal-dot-yellow" />
          <span className="terminal-dot terminal-dot-green" />
        </div>
        <div className="terminal-title">gitpulse</div>
      </div>
      <div
        className="terminal-body"
        id="terminal-body"
        style={{ height: 'calc(100% - 40px)' }}
      />
    </div>
  );
}

// Hook for using terminal methods - doesn't import xterm at top level
export function useTerminal() {
  const terminalRef = useRef<XTermTerminalType | null>(null);

  const setTerminal = (term: XTermTerminalType | null) => {
    terminalRef.current = term;
  };

  const write = (data: string) => {
    terminalRef.current?.write(data);
  };

  const writeln = (data: string) => {
    terminalRef.current?.writeln(data);
  };

  const clear = () => {
    terminalRef.current?.clear();
  };

  const reset = () => {
    terminalRef.current?.reset();
  };

  return { terminal: terminalRef.current, write, writeln, clear, reset, setTerminal };
}