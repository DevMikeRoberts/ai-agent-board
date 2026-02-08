# Copilot Kanban Agent

A drag-and-drop Kanban board that assigns coding tasks to GitHub Copilot as an autonomous agent. Drop a task into "In Progress" and Copilot will plan, execute, and complete the work — streaming live progress back to the board.

![Screenshot placeholder](docs/screenshot.png)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, Tailwind CSS 4, Framer Motion |
| Drag & Drop | @dnd-kit |
| Backend | Express, better-sqlite3, ws (WebSocket) |
| AI Agent | @github/copilot-sdk |
| Monorepo | npm workspaces |

## Features

- Kanban board with Backlog, In Progress, Review, Done columns
- Drag-and-drop task management with transition validation
- Real-time agent activity streaming via WebSocket
- Agent panel showing thinking, tool calls, file edits, and command output
- Git worktree isolation per task (optional)
- One-click PR creation from completed tasks
- Dark/light theme toggle
- Task search and filtering
- Responsive layout (mobile stacks vertically, desktop horizontal)

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- GitHub Copilot CLI (`gh extension install github/gh-copilot`)
- Authenticated via `gh auth login`

### Install

```bash
git clone <repo-url>
cd copilot-kanban-agent
npm install
```

### Run (development)

Start both client and server in separate terminals:

```bash
# Terminal 1 — API server (port 3001)
npm run dev:server

# Terminal 2 — Vite dev server (port 5173)
npm run dev:client
```

Or run them together with any process manager you prefer.

### Build

```bash
npm run build:server
npm run build:client
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `COPILOT_MODEL` | `claude-sonnet-4-20250514` | Model for Copilot sessions |

## Project Structure

```
copilot-kanban-agent/
  packages/
    client/          # React frontend (Vite)
      src/
        components/  # Board, Column, TaskCard, AgentPanel, Header, etc.
        lib/         # API client, utilities, mock data
    server/          # Express backend
      src/
        routes/      # REST API routes
        services/    # Copilot SDK integration, business logic
        db.ts        # SQLite database
        websocket.ts # WebSocket broadcast
    e2e/             # Playwright end-to-end tests
  shared/            # Shared types and constants (Task, AgentEvent, etc.)
```

## How the Copilot SDK Integration Works

The server maintains a singleton `CopilotClient` from `@github/copilot-sdk` that manages the connection to the Copilot CLI server process.

When a task is started:

1. **Client init** — The `CopilotClient` is lazily created with `logLevel: 'info'` and `autoRestart: true`, then explicitly started via `client.start()`.

2. **Session creation** — A `CopilotSession` is created with the task's working directory (worktree path or repo path), a system message providing project context, and a permission handler that auto-approves all operations.

3. **Prompt dispatch** — The task title and description are sent as a prompt via `session.sendAndWait()`, which blocks until the agent finishes.

4. **Event streaming** — All SDK session events are mapped to the app's `AgentEvent` types and broadcast over WebSocket in real time:
   - `assistant.turn_start` / `assistant.intent` / `assistant.reasoning_delta` -> `thinking`
   - `assistant.message_delta` -> `output` (streaming text)
   - `assistant.message` -> `complete`
   - `tool.execution_start` -> `command`
   - `tool.execution_complete` / `tool.execution_partial_result` -> `output`
   - `session.error` -> `error`

5. **Cleanup** — On completion the session is destroyed. On stop, `session.abort()` is called first. On server shutdown, all sessions are cleaned up and `client.stop()` is called.
