import type { AgentType, AgentEvent } from '../types.js';

/**
 * Normalized result returned by every provider's execute().
 * Providers MUST return a result in all cases — including abort, error, and
 * normal completion. The agent-manager uses this to determine terminal state.
 */
export interface AgentResult {
  status: 'complete' | 'failed';
  error?: string;
}

export interface AgentProvider {
  readonly name: AgentType;
  readonly displayName: string;
  readonly model: string;

  start(): Promise<void>;
  stop(): Promise<void>;

  createSession(config: AgentSessionConfig): Promise<AgentSession>;
}

export interface AgentSessionConfig {
  taskId: string;
  workingDirectory: string;
  /** Original repo path — used for worktree path rewriting to enforce sandboxing. */
  repoPath?: string;
  systemPrompt: string;
  onEvent: (event: AgentEvent) => void;
}

export interface AgentSession {
  execute(prompt: string): Promise<AgentResult>;
  /** Send a follow-up message to a running agent session. */
  send(message: string): Promise<void>;
  abort(): Promise<void>;
  destroy(): Promise<void>;
  readonly sessionId: string | null;
}
