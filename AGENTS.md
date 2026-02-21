# AGENTS.md

## Project Overview

Copilot Kanban Agent — a drag-and-drop Kanban board that delegates coding tasks to AI coding agents (GitHub Copilot, Claude Code, OpenAI Codex). Monorepo with npm workspaces.

## Architecture

```
copilot-kanban-agent/
├── packages/
│   ├── client/          # React 19 + Vite + Tailwind 4 + Framer Motion
│   │   └── src/
│   │       ├── components/  # Board, Column, TaskCard, AgentPanel, Header, dialogs
│   │       ├── hooks/       # useTasks, useTheme, useDebounce, useKeyboardShortcuts
│   │       ├── lib/         # api.ts (REST + WebSocket), agent-config.ts, columns.ts, utils
│   │       └── types/       # Client-side type re-exports
│   ├── server/          # Express + better-sqlite3/pg + ws + multi-agent SDKs
│   │   └── src/
│   │       ├── agents/      # Provider pattern: base.ts (interface), copilot.ts, claude.ts, codex.ts, detection.ts
│   │       ├── routes/      # tasks.ts (CRUD + agent lifecycle)
│   │       ├── services/    # agent-manager.ts (session orchestration, event caching)
│   │       ├── repositories/# sqlite.ts, postgres.ts, types.ts (repository pattern)
│   │       ├── db.ts        # SQLite + PostgreSQL init + migrations
│   │       ├── websocket.ts # WebSocket broadcast
│   │       └── index.ts     # Express app setup + graceful shutdown
│   └── e2e/             # Playwright tests
├── shared/              # Shared types (Task, AgentEvent, ColumnId, AgentType, etc.) + validation constants
├── scripts/             # test-sdk-e2e.sh
└── k8s/                 # Kubernetes manifests (namespace, deployments, services, ingress)
```

## Key Technical Decisions

- **Multi-agent support** — pluggable `AgentProvider`/`AgentSession` interfaces in `agents/base.ts`. Three providers: `copilot` (`@github/copilot-sdk`), `claude` (`@anthropic-ai/claude-agent-sdk`), `codex` (`@openai/codex-sdk`). Auto-detected at startup via `detection.ts`.
- **Dual database backends** — SQLite via `better-sqlite3` (default, zero config) or PostgreSQL via `pg` (set `DATABASE_URL`). Both implement the `TaskRepository` interface.
- **Event streaming** — SDK events mapped to `AgentEvent`s, persisted to database, broadcast via WebSocket. In-memory LRU cache (200 tasks max, 100 events per task).
- **Git worktrees** — optional per-task branch isolation. Agent works in worktree directory, path rewriting via `onPreToolUse` hook.
- **Vite proxy** — client proxies `/api` and `/ws` to the server. In Docker, `API_URL` env var points to `http://server:3001`.
- **Shared validation** — `shared/constants.ts` exports validators (`isValidPriority`, `isValidColumnId`, etc.) and limits (`MAX_TITLE_LENGTH`, `MAX_DESCRIPTION_LENGTH`) used by both client and server.

## Docker Setup

Two-container dev environment via Docker Compose with live-reload volumes:

```bash
docker compose up -d          # Start both containers
docker compose logs -f        # Watch logs
docker compose down           # Stop
docker compose build --no-cache  # Rebuild after dependency changes
```

### Containers

| Service | Port | Description |
|---------|------|-------------|
| `client` | 4175 | Vite dev server with HMR |
| `server` | 3001 | Express API + WebSocket + agent SDKs |

### Volumes (live reload)

- `packages/client/src` → edit React components, Vite hot-reloads
- `packages/server/src` → edit server code, tsx watch restarts
- `shared/` → type changes picked up by both
- `packages/server/data` → SQLite persistence across restarts
- `~/projects` → mounted at `/host-projects` for agent file access
- Agent CLI binaries (`claude`, `codex`) and auth credentials mounted read-only from host

### Important: Repo Paths in Docker

When running in Docker, agents access host files via the `/host-projects` mount. In the "Configure Agent Run" dialog, use `/host-projects/my-app` instead of `~/projects/my-app`.

The `ALLOWED_REPO_ROOTS` env is set to `/host-projects,/tmp` in docker-compose.yml.

## Running Without Docker

```bash
npm install
npm run dev:server   # Terminal 1 — port 3001
npm run dev:client   # Terminal 2 — port 4175
```

## Build

```bash
npm run build:client   # tsc + vite build
npm run build:server   # tsc -b tsconfig.build.json
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `DATABASE_URL` | _(none)_ | PostgreSQL connection string; when unset, uses SQLite |
| `DB_PATH` | `./data/kanban.db` | SQLite database file path |
| `COPILOT_MODEL` | `claude-opus-4-20250514` | Model for Copilot SDK sessions |
| `CLAUDE_MODEL` | `claude-opus-4-20250514` | Model for Claude Code sessions |
| `CODEX_MODEL` | `gpt-5.2-codex` | Model for OpenAI Codex sessions |
| `COPILOT_DENIED_TOOLS` | _(none)_ | Comma-separated tool names to deny in Copilot sessions |
| `ALLOWED_REPO_ROOTS` | _(none)_ | Comma-separated allowed repo root paths (security whitelist) |
| `ALLOWED_ORIGINS` | `http://localhost:4175,http://localhost:4176` | CORS origins |
| `AGENT_TIMEOUT_MS` | `600000` (10 min) | Max agent execution time |
| `API_URL` | `http://localhost:3001` | Vite proxy target (set in Docker) |
| `PROJECTS_DIR` | `~/projects` | Host projects path for Docker volume |

## Tests

```bash
# E2E tests (requires both client and server running)
npm test

# Or directly
cd packages/e2e && npx playwright test
```

4 test files, 39 tests: board tests (CRUD, drag, edit, theme, priority, agent panel), agent SDK tests, agent selector tests, API improvement tests.

## Code Patterns

- **Task lifecycle**: backlog → in-progress → review → done (validated transitions in `VALID_TRANSITIONS` from `shared/constants.ts`)
- **Agent lifecycle**: idle → planning → executing → complete/failed (set via `agentStatus`)
- **Agent types**: `copilot | claude | codex` — each task can specify which agent to use via `agentType`
- **Provider pattern**: `AgentProvider` creates `AgentSession`s. `AgentManager` orchestrates sessions with timeouts, event caching, and graceful cleanup.
- **Repository pattern**: `TaskRepository` interface with `SqliteTaskRepository` and `PostgresTaskRepository` implementations.
- **Event coalescing**: AgentPanel merges consecutive thinking/output events for readability
- **Graceful shutdown**: 5s force-exit timeout after `SIGINT`/`SIGTERM`, all SDK sessions cleaned up
- **Copilot permission request**: SDK uses `req.kind` (shell/read/write/mcp/url/memory), NOT `req.toolName`

## Known Issues (LOW priority)

- Search input missing `aria-label` (Header.tsx)
- No WebSocket re-sync after reconnection (api.ts)
- `db.close()` not in try/catch during shutdown (index.ts)
- Keyboard shortcuts don't check `contenteditable` elements (useKeyboardShortcuts.ts)
- Timer leak in CopyButton if component unmounts within 2s (AgentPanel.tsx)
