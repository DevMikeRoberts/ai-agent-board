import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { AgentEvent } from '@/types';

interface TerminalViewProps {
  events: AgentEvent[];
  streaming: boolean;
  theme?: 'dark' | 'light';
}

const ANSI = {
  reset:   '\x1b[0m',
  dim:     '\x1b[2m',
  bold:    '\x1b[1m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  cyan:    '\x1b[36m',
  blue:    '\x1b[34m',
  red:     '\x1b[31m',
  magenta: '\x1b[35m',
  gray:    '\x1b[90m',
};

function eventToLines(event: AgentEvent): string {
  switch (event.type) {
    case 'file_read': {
      const file = event.metadata?.file ?? event.content;
      return `${ANSI.cyan}▸ read  ${ANSI.reset}${ANSI.dim}${file}${ANSI.reset}\r\n`;
    }
    case 'file_write':
    case 'file_edit': {
      const file = event.metadata?.file ?? event.content;
      return `${ANSI.yellow}▸ write ${ANSI.reset}${ANSI.dim}${file}${ANSI.reset}\r\n`;
    }
    case 'command': {
      const cmd = event.metadata?.command ?? event.content;
      return `${ANSI.blue}$ ${ANSI.reset}${cmd}\r\n`;
    }
    case 'command_output': {
      const lines = event.content.split('\n').map(l => `${ANSI.gray}  ${l}${ANSI.reset}`).join('\r\n');
      return lines + '\r\n';
    }
    case 'thinking': {
      const lines = event.content.split('\n').map(l => `${ANSI.magenta}  ${l}${ANSI.reset}`).join('\r\n');
      return lines + '\r\n';
    }
    case 'output': {
      const lines = event.content.split('\n').map(l => `  ${l}`).join('\r\n');
      return lines + '\r\n';
    }
    case 'complete':
      return `\r\n${ANSI.green}${ANSI.bold}✓ Complete${ANSI.reset}\r\n`;
    case 'error':
      return `${ANSI.red}✗ ${event.content}${ANSI.reset}\r\n`;
    default:
      return '';
  }
}

const DARK_THEME = {
  background: 'transparent',
  foreground: '#e2e8f0',
  cursor:     '#e2e8f0',
  black:      '#1e293b',
  red:        '#f87171',
  green:      '#4ade80',
  yellow:     '#facc15',
  blue:       '#60a5fa',
  magenta:    '#c084fc',
  cyan:       '#22d3ee',
  white:      '#e2e8f0',
  brightBlack:'#64748b',
};

const LIGHT_THEME = {
  background: 'transparent',
  foreground: '#1e293b',
  cursor:     '#1e293b',
  black:      '#e2e8f0',
  red:        '#dc2626',
  green:      '#16a34a',
  yellow:     '#ca8a04',
  blue:       '#2563eb',
  magenta:    '#9333ea',
  cyan:       '#0891b2',
  white:      '#1e293b',
  brightBlack:'#94a3b8',
};

export function TerminalView({ events, streaming, theme = 'dark' }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const renderedCountRef = useRef(0);

  // Init terminal once
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      convertEol: true,
      scrollback: 5000,
      disableStdin: true,
      cursorBlink: false,
      fontSize: 11,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      theme: theme === 'light' ? LIGHT_THEME : DARK_THEME,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;
    renderedCountRef.current = 0;

    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      renderedCountRef.current = 0;
    };
  }, [theme]);

  // Write new events incrementally, coalescing consecutive same-type fragments
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const newEvents = events.slice(renderedCountRef.current);

    // Coalesce consecutive output/thinking fragments into single events before rendering
    const STREAMABLE = new Set(['output', 'thinking']);
    const coalesced: typeof newEvents = [];
    for (const event of newEvents) {
      const prev = coalesced[coalesced.length - 1];
      if (prev && STREAMABLE.has(event.type) && prev.type === event.type) {
        // Merge into previous
        coalesced[coalesced.length - 1] = { ...prev, content: prev.content + event.content };
      } else {
        coalesced.push(event);
      }
    }

    for (const event of coalesced) {
      const line = eventToLines(event);
      if (line) term.write(line);
    }
    renderedCountRef.current = events.length;
  }, [events]);

  // Blinking cursor while streaming
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.cursorBlink = streaming;
  }, [streaming]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ padding: '8px 4px' }}
    />
  );
}
