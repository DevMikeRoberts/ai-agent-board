# Multi-Agent Kanban Board — Implementation Plan

## 1. Overview

Transform the Kanban board from a single-agent (Copilot SDK) system into a multi-agent coding platform where tasks can be assigned to **GitHub Copilot**, **Claude Code**, or **OpenAI Codex**. Add an **Idea-to-Code orchestrator** that breaks high-level ideas into subtasks and delegates them to the best available agent.

**Reference implementation:** The [ZingIt](../zingit/) project already has all three agents integrated with a shared base class, agent detection, and session management. We adapt those patterns to the Kanban board's event system and task lifecycle.

---

## 2. Current Architecture

### Single Agent: `packages/server/src/services/copilot.ts`

- **Singleton `CopilotClient`** — lazy-initialized via `getClient()`, with `autoRestart: true`
- **Session management** — `sessions` Map keyed by `taskId`, each entry holds `{ session, unsubscribe, timeoutId }`
- **Event mapping** — `mapAndEmitSessionEvent()` converts SDK `SessionEvent`s to our `AgentEvent` types:
  - `assistant.turn_start` / `assistant.intent` / `assistant.reasoning_delta` → `thinking`
  - `assistant.message_delta` → `output`
  - `assistant.message` → `complete`
  - `tool.execution_start` → `command`
  - `tool.execution_complete` / `tool.execution_partial_result` → `output`
  - `session.error` → `error`
- **Lifecycle** — `startAgent()` creates session, subscribes to events, calls `sendAndWait()`. Completion via `session.idle` event or `sendAndWait` return. Timeout guard at `AGENT_TIMEOUT_MS`.
- **Worktree support** — optional git worktree creation with `onPreToolUse` path rewriting hook
- **Event persistence** — write-through to SQLite via `eventRepo`, in-memory LRU cache (200 tasks, 100 events/task)

### Limitations
- Hardcoded to Copilot SDK — no way to select a different agent
- No `agent_type` field on tasks
- No agent availability detection
- Monolithic service file (400+ lines) that mixes agent logic with session/event management

---

## 3. Target Architecture

### Agent Registry Pattern

```
packages/server/src/
├── agents/
│   ├── base.ts              # Abstract base class (AgentProvider interface)
│   ├── copilot.ts           # Copilot SDK adapter
│   ├── claude.ts            # Claude Code SDK adapter
│   ├── codex.ts             # Codex SDK adapter
│   └── detection.ts         # Agent availability detection
├── services/
│   ├── agent-manager.ts     # Registry, session management, event routing
│   └── orchestrator.ts      # Idea-to-Code orchestrator
```

### Agent Interface

```typescript
// packages/server/src/agents/base.ts

export interface AgentProvider {
  readonly name: AgentType;           // 'copilot' | 'claude' | 'codex'
  readonly displayName: string;       // 'GitHub Copilot' | 'Claude Code' | 'OpenAI Codex'
  readonly model: string;             // Current model identifier

  start(): Promise<void>;
  stop(): Promise<void>;

  createSession(config: AgentSessionConfig): Promise<AgentSession>;
}

export interface AgentSessionConfig {
  taskId: string;
  workingDirectory: string;
  systemPrompt: string;
  onEvent: (event: AgentEvent) => void;        // Unified event callback
  onPermissionRequest?: (req: any) => any;      // Agent-specific permission handling
}

export interface AgentSession {
  execute(prompt: string): Promise<void>;       // Runs the task (blocks until done)
  abort(): Promise<void>;                       // Cancel in-flight execution
  destroy(): Promise<void>;                     // Clean up resources
  readonly sessionId: string | null;            // For session resumption
}
```

### Agent Manager (replaces current copilot.ts exports)

The `AgentManager` class handles:
- Agent registry (register/get providers)
- Agent detection at startup
- Session lifecycle (start, stop, timeout, cleanup)
- Event routing (provider events → `emitEvent()` → SQLite + WebSocket)
- Worktree setup/teardown (shared across all agents)

```typescript
// packages/server/src/services/agent-manager.ts

class AgentManager {
  private providers = new Map<AgentType, AgentProvider>();
  private sessions = new Map<string, ManagedSession>();    // taskId → session
  private deletedTasks = new Set<string>();                // From current impl

  async initialize(): Promise<void>;                       // Detect + start available agents
  async shutdown(): Promise<void>;                         // Stop all sessions + providers

  getAvailableAgents(): AgentInfo[];                       // For GET /api/agents
  startAgent(task: Task, onStatusChange): void;            // Replaces current startAgent()
  stopAgent(taskId: string): boolean;                      // Replaces current stopAgent()

  // Delegated from current copilot.ts
  getEvents(taskId: string): AgentEvent[];
  clearEvents(taskId: string): void;
}
```

---

## 4. Agent Implementations

### 4.1 GitHub Copilot (existing — extract to adapter)

**SDK:** `@github/copilot-sdk` ^0.1.23
**Auth:** GitHub CLI (`gh auth login`) — reads from `~/.config/github-copilot/`
**Model:** `process.env.COPILOT_MODEL || 'claude-sonnet-4-20250514'`

```typescript
// Session creation
const client = new CopilotClient({ logLevel: 'info', autoRestart: true });
await client.start();
const session = await client.createSession({
  model, streaming: true, workingDirectory,
  systemMessage: { mode: 'append', content: '...' },
  onPermissionRequest: (req) => ({ kind: 'approved' }),
});

// Execution
await session.sendAndWait({ prompt });

// Event mapping (already implemented in mapAndEmitSessionEvent)
session.on((event: SessionEvent) => { ... });

// Cleanup
session.destroy();
client.stop();
```

**Event mapping:**
| SDK Event | → AgentEvent Type |
|-----------|-------------------|
| `assistant.turn_start` | `thinking` |
| `assistant.intent` | `thinking` |
| `assistant.reasoning_delta` | `thinking` |
| `assistant.message_delta` | `output` |
| `assistant.message` | `complete` |
| `tool.execution_start` | `command` |
| `tool.execution_complete` | `output` |
| `tool.execution_partial_result` | `output` |
| `session.error` | `error` |
| `session.idle` | (triggers completion) |

**Permission request:** `req.kind` = `'shell'` | `'read'` | `'write'` | `'mcp'` | `'url'` | `'memory'`

### 4.2 Claude Code (new — from ZingIt reference)

**SDK:** `@anthropic-ai/claude-agent-sdk` ^0.2.17
**Auth:** Anthropic API key or Claude Code OAuth (`~/.claude/.credentials.json`)
**Model:** `process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'`

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

// No explicit client — query() is the entry point
const response = query({
  prompt: messageGenerator,  // AsyncGenerator yielding user messages
  options: {
    model, cwd: projectDir,
    permissionMode: 'acceptEdits',  // Auto-approve file edits
    systemPrompt: '...',
    resume: sessionId,              // Optional: resume previous session
  }
});

// Streaming response
for await (const message of response) {
  switch (message.type) {
    case 'system':        // Init — capture session_id
    case 'assistant':     // Text content blocks
    case 'stream_event':  // Real-time deltas (content_block_delta)
    case 'tool_progress': // Tool executing
    case 'result':        // Query completed
  }
}
```

**Event mapping:**
| SDK Message Type | → AgentEvent Type |
|------------------|-------------------|
| `system` (init) | (capture sessionId) |
| `assistant` (content blocks) | `output` or `complete` |
| `stream_event` (content_block_delta) | `output` |
| `stream_event` (content_block_stop) | (no-op) |
| `stream_event` (message_stop) | (no-op) |
| `tool_progress` | `command` |
| `result` | `complete` (triggers completion) |
| Error catch | `error` |

**Key differences from Copilot:**
- No persistent client — `query()` is stateless, session resumption via `resume` option
- `permissionMode: 'acceptEdits'` replaces per-request `onPermissionRequest`
- Multimodal support via content blocks (`TextBlock | ImageBlock`)
- Session ID comes from `system` init message, not from session object

### 4.3 OpenAI Codex (new — from ZingIt reference)

**SDK:** `@openai/codex-sdk` ^0.89.0
**Auth:** Codex CLI auth file (`~/.codex/auth.json`) — login via `codex` CLI
**Model:** `process.env.CODEX_MODEL || 'gpt-5.2-codex'`

```typescript
import { Codex } from '@openai/codex-sdk';

const codex = new Codex();
const thread = codex.startThread({ workingDirectory });
// Or resume: codex.resumeThread(threadId, { workingDirectory });

// Execution via streaming
const { events } = await thread.runStreamed(input);

for await (const event of events) {
  switch (event.type) {
    case 'item.started':     // Tool/action started
    case 'item.completed':   // Item finished (agent_message, command_execution, file_change, reasoning)
    case 'turn.completed':   // Turn finished → idle
    case 'turn.failed':      // Error
    case 'error':            // Error
  }
}
```

**Event mapping:**
| SDK Event | → AgentEvent Type |
|-----------|-------------------|
| `item.started` | `command` (with tool name) |
| `item.completed` (agent_message) | `output` |
| `item.completed` (reasoning) | `thinking` |
| `item.completed` (command_execution) | `command` + `output` |
| `item.completed` (file_change) | `output` (file paths) |
| `turn.completed` | (triggers completion) |
| `turn.failed` | `error` |
| `error` | `error` |

**Key differences:**
- Thread-based model (start/resume thread, then `runStreamed`)
- Structured input: `Array<{ type: 'text', text } | { type: 'local_image', path }>`
- AbortController for cancellation
- Items have distinct types: `agent_message`, `reasoning`, `command_execution`, `file_change`

---

## 5. UI Changes

### 5.1 WorktreeDialog — Agent Selector

Add an agent dropdown to `packages/client/src/components/WorktreeDialog.tsx`:

```tsx
// New state
const [agentType, setAgentType] = useState<AgentType>('copilot');
const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([]);

// Fetch available agents on mount
useEffect(() => {
  api.getAgents().then(setAvailableAgents);
}, []);

// Dropdown in the form (between repo path and branch name fields)
<div>
  <label>Coding Agent</label>
  <select value={agentType} onChange={e => setAgentType(e.target.value)}>
    {availableAgents.map(a => (
      <option key={a.name} value={a.name} disabled={!a.available}>
        {a.displayName} {!a.available ? '(unavailable)' : ''}
      </option>
    ))}
  </select>
</div>
```

Submit includes `agentType` in the config payload.

### 5.2 AgentPanel — Agent Badge

Show which agent is running in the panel header:

```tsx
// In the header section, next to "Agent active" indicator
{task.agentType && (
  <span className="text-[10px] text-muted-foreground font-mono">
    {task.agentType === 'copilot' ? '🤖 Copilot' :
     task.agentType === 'claude' ? '🟠 Claude' :
     task.agentType === 'codex' ? '🟢 Codex' : task.agentType}
  </span>
)}
```

### 5.3 TaskCard — Agent Icon

Small icon on task cards showing the assigned agent:

```tsx
// Bottom-right of card, next to priority badge
{task.agentType && task.agentType !== 'copilot' && (
  <span className="text-[10px]">
    {task.agentType === 'claude' ? '🟠' : '🟢'}
  </span>
)}
```

### 5.4 Agent Status Indicator

Add to Header or a new settings panel — shows which agents are available:

```tsx
// GET /api/agents response displayed as colored dots
{agents.map(a => (
  <span key={a.name} title={`${a.displayName}: ${a.available ? 'Ready' : a.reason}`}>
    <span className={a.available ? 'text-emerald-400' : 'text-red-400'}>●</span>
    {a.displayName}
  </span>
))}
```

---

## 6. Idea-to-Code Orchestrator

### Concept

A meta-agent that doesn't write code itself — it plans, delegates, and monitors.

### Flow

```
User: "Build a REST API for user auth with JWT and rate limiting"
  ↓
POST /api/orchestrate { idea: "...", agentPreferences?: {...} }
  ↓
Orchestrator (runs as isolated session):
  1. Analyzes the idea
  2. Breaks into subtasks with descriptions
  3. Creates Kanban cards via POST /api/tasks
  4. Assigns agent types based on task characteristics:
     - Complex multi-file refactors → Claude Code
     - Quick scaffolding/boilerplate → Copilot
     - Test generation → Codex
  5. Starts agents on each card (moves to in-progress)
  6. Monitors events for completion/failure
  7. Creates follow-up cards if tests fail
  8. Reports final status
```

### Implementation: `packages/server/src/services/orchestrator.ts`

```typescript
export async function orchestrate(
  idea: string,
  repoPath: string,
  agentManager: AgentManager,
  taskRepo: TaskRepository,
): Promise<{ taskIds: string[] }> {
  // 1. Use an LLM call to break the idea into subtasks
  //    (Could use any of the three SDKs, or a direct API call)
  const plan = await planTasks(idea, repoPath);

  // 2. Create tasks in the database
  const taskIds: string[] = [];
  for (const subtask of plan.tasks) {
    const task = taskRepo.create({
      title: subtask.title,
      description: subtask.description,
      priority: subtask.priority,
      columnId: 'in-progress',
      agentType: subtask.recommendedAgent,
      repoPath,
    });
    taskIds.push(task.id);
  }

  // 3. Start agents on each task
  for (const taskId of taskIds) {
    const task = taskRepo.findById(taskId)!;
    agentManager.startAgent(task, (status) => {
      taskRepo.update(taskId, { agentStatus: status });
    });
  }

  return { taskIds };
}
```

### Orchestrator API

```
POST /api/orchestrate
Body: {
  idea: string,                          // Natural language description
  repoPath: string,                      // Target repository
  branchName?: string,                   // Optional branch for all tasks
  useWorktree?: boolean,                 // Isolate in worktrees
  agentPreferences?: {
    default: AgentType,                  // Fallback agent
    rules?: Array<{                      // Optional routing rules
      pattern: string,                   // e.g., "test", "refactor", "scaffold"
      agent: AgentType
    }>
  }
}

Response: {
  orchestrationId: string,
  taskIds: string[],
  plan: Array<{ title, description, agent, priority }>
}
```

---

## 7. Database & API Changes

### Schema

```sql
-- Add agent_type column to tasks
ALTER TABLE tasks ADD COLUMN agent_type TEXT NOT NULL DEFAULT 'copilot';

-- Valid values: 'copilot', 'claude', 'codex'
```

Update `shared/types.ts`:

```typescript
export type AgentType = 'copilot' | 'claude' | 'codex';

export interface Task {
  // ... existing fields ...
  agentType: AgentType;
}
```

### New API Endpoints

```typescript
// GET /api/agents — list available agents
router.get('/agents', async (req, res) => {
  const agents = agentManager.getAvailableAgents();
  res.json(agents);
});

// POST /api/orchestrate — submit an idea
router.post('/orchestrate', async (req, res) => {
  const { idea, repoPath, branchName, useWorktree, agentPreferences } = req.body;
  const result = await orchestrate(idea, repoPath, agentManager, taskRepo);
  res.json(result);
});
```

### Modified Endpoints

```typescript
// PATCH /api/tasks/:id — add agentType to updatable fields
// POST /api/tasks/:id/configure — accept agentType in config
// POST /api/tasks/:id/run — use task.agentType to select provider
```

---

## 8. Docker Considerations

### Server Dockerfile Changes

```dockerfile
# Install all three CLIs for agent detection
RUN npm install -g @anthropic-ai/claude-code @github/copilot @openai/codex

# Or install them as workspace dependencies (already done via package.json)
```

### Docker Compose Volume Mounts

```yaml
server:
  volumes:
    # ... existing volumes ...
    # Claude Code auth
    - ~/.claude:/root/.claude:ro
    # Codex auth
    - ~/.codex:/root/.codex:ro
    # GitHub/Copilot auth (already mounted)
    - ~/.config/github-copilot:/root/.config/github-copilot:ro
  environment:
    # Model overrides per agent
    - COPILOT_MODEL=claude-sonnet-4-20250514
    - CLAUDE_MODEL=claude-sonnet-4-20250514
    - CODEX_MODEL=gpt-5.2-codex
```

### Agent Detection at Startup

```typescript
// In server startup (index.ts)
const agentManager = new AgentManager();
await agentManager.initialize();  // Detects available CLIs, starts providers
console.log('Available agents:', agentManager.getAvailableAgents()
  .filter(a => a.available).map(a => a.displayName).join(', '));
```

---

## 9. Implementation Phases

### Phase 1: Agent Abstraction + Claude Code (1-2 days)

**Goal:** Refactor single-agent copilot.ts into multi-agent registry. Add Claude Code.

1. Create `packages/server/src/agents/base.ts` — `AgentProvider` interface
2. Create `packages/server/src/agents/copilot.ts` — extract from `services/copilot.ts`
3. Create `packages/server/src/agents/claude.ts` — adapt from ZingIt
4. Create `packages/server/src/agents/detection.ts` — adapt from ZingIt
5. Create `packages/server/src/services/agent-manager.ts` — registry + session management
6. Refactor `services/copilot.ts` → thin wrapper delegating to `AgentManager`
7. Add `agent_type` column to SQLite schema
8. Update `shared/types.ts` with `AgentType`
9. Install `@anthropic-ai/claude-agent-sdk` dependency
10. Test: Copilot and Claude Code both execute tasks

### Phase 2: Codex + Agent Selector UI (1 day)

**Goal:** Add Codex agent and let users choose agents in the UI.

1. Create `packages/server/src/agents/codex.ts` — adapt from ZingIt
2. Install `@openai/codex-sdk` dependency
3. Add `GET /api/agents` endpoint
4. Update `WorktreeDialog.tsx` — agent selector dropdown
5. Update `AgentPanel.tsx` — agent badge in header
6. Update `TaskCard.tsx` — agent icon
7. Update `api.ts` — `getAgents()` method
8. Wire `agentType` through configure → run flow
9. Test: all three agents selectable and functional

### Phase 3: Idea-to-Code Orchestrator (2-3 days)

**Goal:** Submit an idea, get a board full of tasks assigned to different agents.

1. Create `packages/server/src/services/orchestrator.ts`
2. Add `POST /api/orchestrate` endpoint
3. Implement `planTasks()` — LLM-based task decomposition
4. Implement agent routing logic (which agent for which task type)
5. Create client UI: "New Idea" dialog (text area + submit)
6. Add orchestration status tracking (how many tasks complete/failed)
7. Follow-up card creation on test failures
8. Test: end-to-end idea → cards → agents → completion

### Phase 4: Performance Tracking (future)

**Goal:** Learn which agent performs best for which task types.

1. Track per-task metrics: execution time, event count, success/failure, retry count
2. `agent_metrics` table in SQLite
3. Dashboard view: agent comparison stats
4. Auto-suggest agent based on task description keywords
5. A/B testing: same task to two agents, compare results

---

## 10. SDK Reference

| | GitHub Copilot | Claude Code | OpenAI Codex |
|---|---|---|---|
| **Package** | `@github/copilot-sdk` | `@anthropic-ai/claude-agent-sdk` | `@openai/codex-sdk` |
| **Version** | ^0.1.23 | ^0.2.17 | ^0.89.0 |
| **Import** | `{ CopilotClient }` | `{ query }` | `{ Codex }` |
| **Init** | `new CopilotClient()` → `client.start()` | None (stateless) | `new Codex()` |
| **Session** | `client.createSession(opts)` | `query({ prompt, options })` | `codex.startThread(opts)` |
| **Execute** | `session.sendAndWait({ prompt })` | `for await (msg of response)` | `thread.runStreamed(input)` |
| **Resume** | `client.resumeSession(id, opts)` | `options.resume = id` | `codex.resumeThread(id, opts)` |
| **Cancel** | `session.abort()` | N/A (return from loop) | `AbortController.abort()` |
| **Cleanup** | `session.destroy()` → `client.stop()` | Automatic | Automatic |
| **Auth** | `gh auth login` | API key or OAuth | `codex` CLI login |
| **Auth Path** | `~/.config/github-copilot/` | `~/.claude/.credentials.json` | `~/.codex/auth.json` |
| **Permissions** | `onPermissionRequest(req)` | `permissionMode: 'acceptEdits'` | Thread-level sandbox |
| **Events** | `session.on(callback)` | `for await` message types | `for await` event types |
| **Multimodal** | File attachments | Content blocks (base64) | Structured input (`local_image`) |
| **Working Dir** | `createSession({ workingDirectory })` | `options.cwd` | `startThread({ workingDirectory })` |

---

## Appendix: File Change Summary

### New Files
- `packages/server/src/agents/base.ts`
- `packages/server/src/agents/copilot.ts`
- `packages/server/src/agents/claude.ts`
- `packages/server/src/agents/codex.ts`
- `packages/server/src/agents/detection.ts`
- `packages/server/src/services/agent-manager.ts`
- `packages/server/src/services/orchestrator.ts`

### Modified Files
- `packages/server/src/services/copilot.ts` → refactored (most logic moves to agent-manager)
- `packages/server/src/routes/tasks.ts` → new endpoints, agent_type handling
- `packages/server/src/db.ts` → migration for agent_type column
- `packages/server/src/index.ts` → AgentManager initialization
- `packages/server/package.json` → new dependencies
- `packages/client/src/components/WorktreeDialog.tsx` → agent selector
- `packages/client/src/components/AgentPanel.tsx` → agent badge
- `packages/client/src/components/TaskCard.tsx` → agent icon
- `packages/client/src/lib/api.ts` → getAgents(), agentType in payloads
- `shared/types.ts` → AgentType, updated Task interface
- `docker-compose.yml` → auth volume mounts, env vars
- `Dockerfile.server` → CLI installations (if using global CLIs)
