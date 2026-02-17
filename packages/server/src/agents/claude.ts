import { v4 as uuid } from 'uuid';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentProvider, AgentSession, AgentSessionConfig, AgentResult } from './base.js';
import type { AgentType } from '../types.js';

export class ClaudeProvider implements AgentProvider {
  readonly name: AgentType = 'claude';
  readonly displayName = 'Claude Code';
  readonly model: string;

  constructor() {
    this.model = process.env.CLAUDE_MODEL || 'claude-opus-4-20250514';
  }

  async start(): Promise<void> {
    // Claude SDK is stateless — no persistent client to start
    console.log(`[claude-provider] ready (model: ${this.model})`);
  }

  async stop(): Promise<void> {
    // Nothing to clean up
  }

  async createSession(config: AgentSessionConfig): Promise<AgentSession> {
    const model = this.model;
    let sessionId: string | null = null;
    let aborted = false;
    // Mutex to serialize execute/send calls — Claude SDK doesn't support concurrent queries
    let queryLock: Promise<void> = Promise.resolve();
    function withLock<T>(fn: () => Promise<T>): Promise<T> {
      const prev = queryLock;
      let resolve: () => void;
      queryLock = new Promise<void>(r => { resolve = r; });
      return prev.then(fn).finally(() => resolve!());
    }

    const agentSession: AgentSession = {
      get sessionId() {
        return sessionId;
      },

      async execute(prompt: string): Promise<AgentResult> {
        return withLock(async () => {
        let result: AgentResult = { status: 'complete' };
        try {
        const messageGenerator = createMessageGenerator(prompt);

        const response = query({
          prompt: messageGenerator,
          options: {
            model,
            cwd: config.workingDirectory,
            permissionMode: 'acceptEdits',
            systemPrompt: config.systemPrompt,
            ...(sessionId ? { resume: sessionId } : {}),
          },
        });

        for await (const message of response) {
          if (aborted) break;

          switch (message.type) {
            case 'system':
              if ('subtype' in message && message.subtype === 'init') {
                sessionId = message.session_id;
                console.log(`[claude-provider] session initialized: ${sessionId}`);
              }
              break;

            case 'assistant':
              if ('message' in message && message.message && 'content' in message.message) {
                const content = message.message.content;
                if (Array.isArray(content)) {
                  for (const block of content) {
                    if (block.type === 'text' && block.text) {
                      config.onEvent({
                        id: uuid(), taskId: config.taskId, type: 'output',
                        content: block.text, timestamp: Date.now(),
                      });
                    }
                  }
                }
              }
              break;

            case 'stream_event':
              if (message.event?.type === 'content_block_delta') {
                const delta = message.event.delta;
                if (delta && 'text' in delta) {
                  config.onEvent({
                    id: uuid(), taskId: config.taskId, type: 'output',
                    content: delta.text, timestamp: Date.now(),
                  });
                }
              }
              break;

            case 'tool_progress':
              config.onEvent({
                id: uuid(), taskId: config.taskId, type: 'command',
                content: `Tool: ${message.tool_name}`,
                timestamp: Date.now(),
                metadata: { command: message.tool_name },
              });
              break;

            case 'result':
              if ('subtype' in message && message.subtype === 'success') {
                config.onEvent({
                  id: uuid(), taskId: config.taskId, type: 'complete',
                  content: 'Claude Code completed the task.',
                  timestamp: Date.now(),
                });
                result = { status: 'complete' };
              } else {
                const errors = 'errors' in message && Array.isArray(message.errors)
                  ? message.errors.join('; ')
                  : `Agent ended with status: ${'subtype' in message ? message.subtype : 'unknown'}`;
                config.onEvent({
                  id: uuid(), taskId: config.taskId, type: 'error',
                  content: errors,
                  timestamp: Date.now(),
                });
                result = { status: 'failed', error: errors };
              }
              break;
          }
        }
        if (aborted) {
          return { status: 'failed', error: 'Execution aborted' };
        }
        return result;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          config.onEvent({
            id: uuid(), taskId: config.taskId, type: 'error',
            content: `Claude SDK error: ${message}`,
            timestamp: Date.now(),
          });
          return { status: 'failed', error: message };
        }
        });
      },

      async send(message: string): Promise<void> {
        if (!sessionId) {
          throw new Error('Claude session not initialized — execute() must be called first');
        }

        return withLock(async () => {
        const messageGenerator = createMessageGenerator(message);

        const response = query({
          prompt: messageGenerator,
          options: {
            model,
            cwd: config.workingDirectory,
            permissionMode: 'acceptEdits',
            systemPrompt: config.systemPrompt,
            resume: sessionId ?? undefined,
          },
        });

        for await (const msg of response) {
          if (aborted) break;

          switch (msg.type) {
            case 'assistant':
              if ('message' in msg && msg.message && 'content' in msg.message) {
                const content = msg.message.content;
                if (Array.isArray(content)) {
                  for (const block of content) {
                    if (block.type === 'text' && block.text) {
                      config.onEvent({
                        id: uuid(), taskId: config.taskId, type: 'output',
                        content: block.text, timestamp: Date.now(),
                      });
                    }
                  }
                }
              }
              break;

            case 'stream_event':
              if (msg.event?.type === 'content_block_delta') {
                const delta = msg.event.delta;
                if (delta && 'text' in delta) {
                  config.onEvent({
                    id: uuid(), taskId: config.taskId, type: 'output',
                    content: delta.text, timestamp: Date.now(),
                  });
                }
              }
              break;

            case 'tool_progress':
              config.onEvent({
                id: uuid(), taskId: config.taskId, type: 'command',
                content: `Tool: ${msg.tool_name}`,
                timestamp: Date.now(),
                metadata: { command: msg.tool_name },
              });
              break;

            case 'result':
              config.onEvent({
                id: uuid(), taskId: config.taskId, type: 'complete',
                content: 'Claude Code completed the follow-up.',
                timestamp: Date.now(),
              });
              break;
          }
        }
        });
      },

      async abort(): Promise<void> {
        aborted = true;
      },

      async destroy(): Promise<void> {
        // SDK handles cleanup automatically
      },
    };

    return agentSession;
  }
}

type SDKUserMessage = {
  type: 'user';
  message: { role: 'user'; content: Array<{ type: 'text'; text: string }> };
  parent_tool_use_id: string | null;
  session_id: string;
};

async function* createMessageGenerator(prompt: string): AsyncGenerator<SDKUserMessage> {
  yield {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [{ type: 'text' as const, text: prompt }],
    },
    parent_tool_use_id: null,
    session_id: '',
  };
}
