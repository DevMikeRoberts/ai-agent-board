---
shaping: true
---

# Multi-Task Groups — Shaping

## Problem

Users create and run tasks one at a time. For projects needing multiple parallel changes (e.g., "add 3 features to my-app"), users must create each task individually, configure each separately, and manage them as unrelated cards on the board. There's no way to express that tasks are related, launch them together, or see aggregate progress.

## Outcome

Users define a batch of related tasks in a single interface, configure parallelism, and launch them — getting aggregate progress tracking and per-task monitoring without manual orchestration.

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| **R0** | Users can define multiple tasks in a single interface and launch them together | Core goal |
| **R1** | Configurable parallelism — user controls how many tasks run concurrently via a 1..N slider that updates in real-time while dragging | Must-have |
| **R2** | Per-child configuration — each child independently selects agent type and worktree toggle | Must-have |
| **R3** | Group-level repo config — repo path and base branch set once at group level, shared by all children | Must-have |
| **R4** | Board behavior — group appears and moves as a single card through columns | Must-have |
| R4.1 | Auto-advance group to "review" when all children complete successfully | Must-have |
| R4.2 | Group stays in "in-progress" if any child fails; remaining queued children still execute | Must-have |
| **R5** | Failure recovery — user can retry individual failed children from the expanded group view | Must-have |
| **R6** | Progress visibility — group card shows aggregate status (N/M complete, running count, agent breakdown) | Must-have |
| **R7** | Backward compatibility — standalone tasks work unchanged; existing APIs, board, and E2E tests unaffected | Must-have |
| **R8** | Worktree smart defaults — worktree ON by default for children, warning when disabled alongside concurrent tasks on the same repo | Nice-to-have |
| **R9** | Atomic group creation — creating a group + N children is transactional; if any child fails validation, nothing is created | Must-have |

---

## Shape A: Task Group with Nested Children (Selected)

A **Task Group** is a parent entity with N child tasks. It appears as a single card on the Kanban board. Children are visible only inside the expanded group view, never as standalone cards on the board.

### Parts

| Part | Mechanism | ⚠️ |
|------|-----------|:--:|
| **A1** | **Group data model** | |
| A1.1 | `TaskGroup` interface: id, title, description, priority, columnId, repoPath, baseBranch, maxConcurrency, timestamps, archived | |
| A1.2 | `Task` extended with nullable `groupId` FK + `groupOrder` (position in group). Standalone tasks have `groupId: null`. | |
| A1.3 | `task_groups` DB table + `ALTER tasks ADD group_id, group_order`. ON DELETE CASCADE for child cleanup. | |
| A1.4 | `TaskGroupRepository` interface (getAll, getById, create, update, delete, getChildTasks) with SQLite + PostgreSQL implementations. | |
| **A2** | **Group CRUD API** | |
| A2.1 | `routes/groups.ts` — GET /api/groups, GET /api/groups/:id (returns group + children), POST /api/groups (creates group + children atomically), PATCH, DELETE (cascade + stop running agents) | |
| A2.2 | `GET /api/tasks` excludes children (`WHERE group_id IS NULL`) so board only shows standalone tasks + groups. Children fetched via `GET /api/groups/:id`. | |
| A2.3 | Auth middleware applied to group routes (same `API_KEY` bearer token as existing routes). | |
| **A3** | **Concurrency queue** | |
| A3.1 | `GroupQueue` in agent-manager: `pendingTaskIds[]`, `runningTaskIds: Set`, `completedTaskIds: Set`, `failedTaskIds: Set`, `maxConcurrency`. | |
| A3.2 | `startGroup()` populates queue, calls `drainQueue()` which starts up to `maxConcurrency - running.size` children using existing `startAgent()` per child. | |
| A3.3 | Each child's completion callback calls `onChildComplete()` → moves task between sets → calls `drainQueue()` to fill the freed slot. | |
| A3.4 | Concurrency is locked once group enters in-progress. Slider only editable in backlog (creation or edit). If group is dragged back to backlog, slider becomes editable again for the next run. No mid-run adjustment — eliminates transient state UX complexity. | |
| **A4** | **Group lifecycle** | |
| A4.1 | `POST /api/groups/:id/run` — validates group is in backlog or in-progress, moves to in-progress, starts queue. Rate-limited per group (5s cooldown, reuse existing `isRateLimited`). | |
| A4.2 | Auto-advance: when `pendingTaskIds.length === 0 && runningTaskIds.size === 0` and `failedTaskIds.size === 0` → update group columnId to 'review', broadcast `group_updated`. | |
| A4.3 | Failure hold: if `failedTaskIds.size > 0` when queue drains, group stays in-progress. Remaining pending children still execute (failure doesn't halt the queue). | |
| A4.4 | `POST /api/groups/:id/stop` — iterates `runningTaskIds`, calls `stopAgent()` per child, clears queue. | |
| A4.5 | Retry: `POST /api/tasks/:id/run` on a failed child within a group → move child from `failedTaskIds` to `runningTaskIds` (or re-enqueue if at concurrency cap). If group was auto-advanced to review, move it back to in-progress. | |
| **A5** | **Worktree orchestration** | |
| A5.1 | Auto-generate branch per child: `group/{shortGroupId}/{childOrder}-{slugifiedTitle}` (e.g., `group/a1b2/0-jwt-auth`). Unique per group + child order. | |
| A5.2 | Reuse existing `setupWorktree()` per child — each child with `useWorktree: true` gets its own worktree directory. | |
| A5.3 | Cleanup: worktrees persist while group is in-progress (for debugging). When group auto-advances to review, completed children's worktrees are auto-cleaned. Failed children's worktrees persist until retry completes or group is archived/deleted. | |
| **A6** | **WebSocket events** | |
| A6.1 | New message type: `group_updated` — broadcast when group metadata changes (column, startedAt, completedAt). | |
| A6.2 | Existing `agent_event` and `task_updated` messages carry `taskId` — client uses `groupId` from local task state to associate events with the correct group. No new event type needed for child progress. | |
| **A7** | **Group creation UI** | |
| A7.1 | `TaskGroupDialog.tsx` — large modal with group-level fields (title, description, priority, repo, branch) + scrollable child task list (each row: title, description, agent dropdown, worktree checkbox, delete button). | |
| A7.2 | Dynamic rows: "Add Task" appends a row, trash icon removes (enforces minimum 2 children). | |
| A7.3 | `ParallelismSlider` — `<input type="range">` with `min=1`, `max={childCount}`, `onInput` handler (not `onChange`) for real-time value display while dragging. | |
| A7.4 | Worktree warning banner: shown when ≥2 children share the same repo and any has `useWorktree: false`. | |
| A7.5 | "Create & Run" button — creates group + immediately starts execution (like existing auto-run). | |
| **A8** | **Board integration** | |
| A8.1 | `TaskGroupCard.tsx` — renders in columns alongside standalone TaskCards. Shows title, aggregate progress bar, agent emoji breakdown, running/complete/failed counts. Click opens GroupPanel. | |
| A8.2 | `Board.tsx` fetches groups via `GET /api/groups` alongside tasks. Renders `TaskGroupCard` for each group in the appropriate column. Child tasks never appear on the board directly. | |
| A8.3 | Drag-and-drop: group cards draggable between columns. Block drag to review/done while any child is `planning` or `executing`. Drag back to backlog stops all running children and resets. | |
| A8.4 | Header: "New Task" button gains a dropdown or split-button: "New Task" / "New Task Group". | |
| **A9** | **Group monitoring panel** | |
| A9.1 | `GroupPanel.tsx` — side panel (reuses AgentPanel layout) showing group header + scrollable list of child tasks with status icon, agent emoji, title, and elapsed/duration time. | |
| A9.2 | Click a child row → navigates into that child's existing AgentPanel (with back button to return to group). | |
| A9.3 | Failed children show retry button inline. Clicking retry calls existing `POST /api/tasks/:id/run`. | |
| A9.4 | Group-level Stop All button. No mid-run parallelism slider (concurrency locked once running). | |
| A9.5 | Progress header: circular progress ring or bar showing `completed / total`, with color segments for complete/failed/running/pending. | |
| **A10** | **Server restart recovery** | |
| A10.1 | On startup, query `task_groups WHERE column_id = 'in-progress'`. For each: mark children with `agentStatus = 'executing'` as `failed` (agent process is gone). Re-queue children with `agentStatus = 'planning'` (hadn't fully started). Reconstruct GroupQueue from DB state and call `drainQueue()` to resume. | |

### Flagged Unknowns

All unknowns resolved ✅:

| Resolved | Part | Decision |
|----------|------|----------|
| ✅ | A3.4 | Concurrency locked once running. Slider editable only in backlog. No mid-run adjustment. |
| ✅ | A5.3 | Worktrees auto-cleaned when group advances to review. Failed children's worktrees persist until retry or archive. |
| ✅ | A10.1 | On restart: executing → failed, planning → re-queued, resume queue. |

---

## Fit Check: R × A

| Req | Requirement | Status | A |
|-----|-------------|--------|---|
| **R0** | Users can define multiple tasks in a single interface and launch them together | Core goal | ✅ |
| **R1** | Configurable parallelism — slider 1..N, real-time update while dragging | Must-have | ✅ |
| **R2** | Per-child configuration — each child independently selects agent type and worktree toggle | Must-have | ✅ |
| **R3** | Group-level repo config — repo path and base branch shared by all children | Must-have | ✅ |
| **R4** | Board behavior — group appears and moves as a single card through columns | Must-have | ✅ |
| R4.1 | Auto-advance group to "review" when all children complete successfully | Must-have | ✅ |
| R4.2 | Group stays in "in-progress" if any child fails; remaining queued children still execute | Must-have | ✅ |
| **R5** | Failure recovery — user can retry individual failed children from expanded group view | Must-have | ✅ |
| **R6** | Progress visibility — group card shows aggregate status | Must-have | ✅ |
| **R7** | Backward compatibility — standalone tasks unaffected | Must-have | ✅ |
| **R8** | Worktree smart defaults with warning | Nice-to-have | ✅ |
| **R9** | Atomic group creation — transactional create | Must-have | ✅ |

**Notes:**
- All requirements pass. Three flagged unknowns (⚠️) on A3.5, A5.3, A10.1 are implementation details, not requirement failures — the mechanisms are described but need refinement.

---

## Edge Cases & Risks

| # | Scenario | Behavior | Risk |
|---|----------|----------|------|
| E1 | All children fail | Group stays in-progress, all show retry buttons. Queue is drained (nothing pending). User retries individually. | Low — straightforward |
| E2 | User deletes group while children are running | Stop all running children (`stopGroup()`), delete group + children (CASCADE). Abort any pending worktree setups. | Medium — need to handle race between stop and completion callbacks |
| E3 | User drags group back to backlog while running | Stop all running children, reset all children to `agentStatus: 'idle'`, clear queue. | Medium — same race condition concern as E2 |
| E4 | Single child in group | Allowed — no minimum enforced at API level. UI enforces minimum 2 in the dialog, but API accepts 1 for flexibility (e.g., programmatic use). | Low |
| E5 | Max children limit | Cap at **20 children per group** (validated server-side). UI slider max is 20. Prevents runaway resource usage and keeps the GroupPanel scrollable. | Low — arbitrary but sensible limit |
| E6 | Worktree disabled + same repo + parallel execution | Warning shown in UI (A7.4), not blocked. Multiple agents on same working directory may conflict on git state. User accepts the risk. | Medium — user error, but we warned them |
| E7 | Agent type unavailable for a child | On group run, if child's agent type is not available, mark that child `failed` with reason "agent not available". Continue with other children. Don't fail the whole group. | Low |
| E8 | Group in review → user retries a failed child | Move group back to in-progress (A4.5). Reconstruct queue with just that child as pending. Start it. On completion, if no more failures, auto-advance back to review. | Medium — state transition logic needs care |
| E9 | Server restart mid-execution | A10.1 recovery: mark `executing` children as `failed`, re-queue `planning` children, resume queue. Group stays in-progress. User can retry failed children. | Medium — flagged unknown, needs spike |
| E10 | Two groups targeting same repo simultaneously | Each group's children get unique worktree branches (namespaced by `group/{groupId}/...`). No collision. Without worktrees, same risk as E6. | Low with worktrees, medium without |
| E11 | Search includes grouped children | `Header.tsx` search filters by title. Grouped children are NOT in the main task list, so search only matches group titles and standalone tasks. If user needs to find a child, they expand the group. | Low — acceptable UX tradeoff |
| E12 | Concurrent group starts (race condition) | `POST /api/groups/:id/run` checks if queue already exists for this group. If so, returns 409 Conflict. Same pattern as existing per-task duplicate prevention. | Low |
| E13 | Editing group while running | Allow editing group metadata (title, description) while running. Block adding/removing children while running (queue integrity). Allow editing pending child descriptions. | Medium — need clear UI disabled states |
| E14 | Group archiving | Archive group → archive all children + stop running agents. Unarchive group → unarchive all children (return to backlog). | Low |
| E15 | Branch naming collision | Two groups on same repo with same base branch: branches are `group/{groupId}/...` — groupId is UUID, so no collision possible. | None |
| E16 | Database transaction failure mid-create | Atomic creation (A2.1): wrap group INSERT + N child INSERTs in a transaction. On any failure, rollback entirely. Return 400 with validation errors for the specific children that failed. | Low — standard pattern |
| E17 | WebSocket reconnection | Existing reconnection logic re-fetches all tasks. Need to also re-fetch groups on reconnect. | Low — mirror existing pattern |
| E18 | Filter chips interaction | Add "Groups" chip to filter bar. When active, show only group cards. When inactive, show all. Individual agent/status filters apply to standalone tasks only (groups show aggregate). | Low |

---

## Implementation Phases

### Phase 1: Data Model + API (Backend)

| # | Task | Files |
|---|------|-------|
| 1 | Add `TaskGroup` type to `shared/types.ts`, extend `Task` with `groupId`/`groupOrder` | shared/types.ts |
| 2 | Add group validation helpers to `shared/constants.ts` (`isValidMaxConcurrency`, `MAX_GROUP_CHILDREN = 20`) | shared/constants.ts |
| 3 | Database migration: `task_groups` table + ALTER tasks for `group_id`, `group_order` (SQLite + PostgreSQL) | packages/server/src/db.ts |
| 4 | `TaskGroupRepository` interface + SQLite implementation | repositories/types.ts, repositories/sqlite-groups.ts |
| 5 | PostgreSQL group repository implementation | repositories/postgres-groups.ts |
| 6 | `routes/groups.ts` — CRUD endpoints with atomic creation (transaction), auth middleware | routes/groups.ts, index.ts |
| 7 | `GET /api/tasks` filter: add `WHERE group_id IS NULL` to exclude grouped children | routes/tasks.ts |
| 8 | `GroupQueue` in agent-manager + `startGroup()`, `onChildComplete()`, `drainQueue()`, `stopGroup()` | services/agent-manager.ts |
| 9 | `group_updated` WebSocket message type | websocket.ts, shared/types.ts |

### Phase 2: UI — Group Creation

| # | Task | Files |
|---|------|-------|
| 10 | `TaskGroupDialog.tsx` — group fields + dynamic child rows + worktree warning | components/TaskGroupDialog.tsx |
| 11 | `ParallelismSlider.tsx` — reusable range slider with real-time `onInput` value | components/ParallelismSlider.tsx |
| 12 | Header: add "New Task Group" entry point (dropdown or split-button) | components/Header.tsx |
| 13 | `useTaskGroups.ts` hook — group state, CRUD methods, WS event handling | hooks/useTaskGroups.ts |
| 14 | `api.ts` — add group API methods (getGroups, createGroup, runGroup, stopGroup, etc.) | lib/api.ts |

### Phase 3: UI — Board Integration

| # | Task | Files |
|---|------|-------|
| 15 | `TaskGroupCard.tsx` — board card with progress bar, agent breakdown, status counts | components/TaskGroupCard.tsx |
| 16 | `Board.tsx` — render groups alongside standalone tasks, hide children, group drag-and-drop | components/Board.tsx |
| 17 | Block drag to review/done while children are running; drag to backlog stops + resets | components/Board.tsx |

### Phase 4: UI — Group Monitoring

| # | Task | Files |
|---|------|-------|
| 18 | `GroupPanel.tsx` — side panel with child list, status icons, progress ring | components/GroupPanel.tsx |
| 19 | Per-child retry button + click-through to child AgentPanel (with back navigation) | components/GroupPanel.tsx |
| 20 | Mid-run controls: Stop All button in GroupPanel (no slider — concurrency locked once running) | components/GroupPanel.tsx |
| 21 | Group auto-advance logic: server broadcasts `group_updated` with new columnId; client updates board. Auto-cleanup completed children's worktrees on advance to review. | services/agent-manager.ts, hooks/useTaskGroups.ts |

### Phase 5: Polish & Hardening

| # | Task | Files |
|---|------|-------|
| 22 | Group deletion cascade: stop agents + delete children + cleanup worktrees | routes/groups.ts, agent-manager.ts |
| 23 | Group archiving/unarchiving (archive all children, restore to backlog) | routes/groups.ts, Board.tsx |
| 24 | Server restart recovery (A10.1): reconstruct GroupQueues from DB on startup | services/agent-manager.ts |
| 25 | Keyboard shortcut: "G" for new group (add to useKeyboardShortcuts) | hooks/useKeyboardShortcuts.ts |
| 26 | Filter chips: "Groups" filter chip in FilterChips component | components/FilterChips.tsx |
| 27 | E2E tests: group creation, execution, progress, retry, stop, drag-and-drop | e2e/tests/groups.spec.ts |

---

## File Changes Summary

| File | Change |
|------|--------|
| `shared/types.ts` | Add `TaskGroup` interface, extend `Task` with `groupId`/`groupOrder`, add `group_updated` to WSMessage |
| `shared/constants.ts` | Add `MAX_GROUP_CHILDREN`, `isValidMaxConcurrency()` |
| `packages/server/src/db.ts` | Migration: `task_groups` table, ALTER tasks |
| `packages/server/src/repositories/types.ts` | Add `TaskGroupRepository` interface |
| `packages/server/src/repositories/sqlite-groups.ts` | **New** — SQLite implementation |
| `packages/server/src/repositories/postgres-groups.ts` | **New** — PostgreSQL implementation |
| `packages/server/src/routes/groups.ts` | **New** — Group CRUD + run/stop endpoints |
| `packages/server/src/routes/tasks.ts` | Filter `WHERE group_id IS NULL` |
| `packages/server/src/services/agent-manager.ts` | Add `GroupQueue`, group orchestration methods |
| `packages/server/src/websocket.ts` | Add `group_updated` broadcast |
| `packages/server/src/index.ts` | Mount groups router |
| `packages/client/src/components/TaskGroupDialog.tsx` | **New** — Group creation form |
| `packages/client/src/components/TaskGroupCard.tsx` | **New** — Board card for groups |
| `packages/client/src/components/GroupPanel.tsx` | **New** — Expanded group monitoring panel |
| `packages/client/src/components/ParallelismSlider.tsx` | **New** — Reusable slider |
| `packages/client/src/components/Board.tsx` | Render groups, hide children, group DnD |
| `packages/client/src/components/Header.tsx` | Add "New Group" entry point |
| `packages/client/src/components/FilterChips.tsx` | Add "Groups" filter chip |
| `packages/client/src/hooks/useTaskGroups.ts` | **New** — Group state management + WS |
| `packages/client/src/hooks/useKeyboardShortcuts.ts` | Add "G" shortcut |
| `packages/client/src/lib/api.ts` | Add group API methods |
| `packages/client/src/types/index.ts` | Re-export `TaskGroup` |
| `packages/e2e/tests/groups.spec.ts` | **New** — E2E tests |
