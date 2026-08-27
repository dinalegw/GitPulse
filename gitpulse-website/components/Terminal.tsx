'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal as XTermTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { cn } from '@/lib/utils';

interface TerminalProps {
  className?: string;
  initialOutput?: string;
  readOnly?: boolean;
  onData?: (data: string) => void;
  onReady?: (terminal: XTermTerminal) => void;
}

export function Terminal({
  className,
  initialOutput = '',
  readOnly = false,
  onData,
  onReady,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

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
        selection: 'rgba(34, 197, 94, 0.3)',
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
    term.open(containerRef.current);

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
    };

    window.addEventListener('resize', handleResize);
    fitAddon.fit();

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

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      terminalRef.current = null;
      setIsReady(false);
    };
  }, [initialOutput, readOnly, onData, onReady]);

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

// Hook for using terminal methods
export function useTerminal() {
  const terminalRef = useRef<XTermTerminal | null>(null);

  const setTerminal = (term: XTermTerminal | null) => {
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