# UX Improvements Plan

## Problem

The app works end-to-end but has friction points that slow down daily usage. Users must configure repo paths in a separate dialog after creating tasks, can't see a clear summary of what an agent changed, have no visibility into WebSocket connection state, and get no guidance when starting with an empty board.

## Improvements (6 items)

### 1. Repo Path in TaskDialog (High Impact)

**Problem:** Creating a task and running an agent is a 2-step workflow. Users create a task in TaskDialog, then must open WorktreeDialog to set repo path, branch, and worktree config before running. For groups this is already solved (group dialog has repo path), but standalone tasks still have this friction.

**Solution:** Add optional repo config fields to TaskDialog that appear when "Auto-run" is checked. When auto-run is off, the fields are hidden (task goes to backlog, user configures later). When auto-run is on, the user can set repo path, branch, and worktree inline — one dialog, one click.

**Implementation:**
- `TaskDialog.tsx`: Add collapsible "Run Configuration" section that shows when `autoRun` is checked
  - Repo path field (with recent paths dropdown — see item #4)
  - Branch name field (auto-generated from title if empty)
  - Base branch field (default: main)
  - Worktree toggle (default: on)
- `TaskDialog.tsx` `onSubmit`: Extend payload to include `repoPath`, `branchName`, `baseBranch`, `useWorktree` when autoRun is true
- No server changes needed — existing `/api/tasks` POST already accepts these fields

**Files:** `packages/client/src/components/TaskDialog.tsx`

---

### 2. File Change Summary (High Impact)

**Problem:** After an agent completes, the user sees a stream of events (thinking, commands, file writes) but no clear summary of what actually changed. They have to scroll through events and expand individual file_write/file_edit entries to understand the result.

**Solution:** Add a "Changes" tab in AgentPanel alongside "Events" and "Terminal" that shows a deduplicated list of files created, modified, and read — extracted from the event stream.

**Implementation:**
- `AgentPanel.tsx`: Add a third tab "Changes" next to "Events" and "Terminal"
- Extract file changes from events: filter for `file_write`, `file_edit`, `file_read` types
- Deduplicate by file path, show latest action per file
- Display as a file tree or flat list with icons:
  - 🟢 Created (file_write with no prior read)
  - 🟡 Modified (file_edit)
  - 📖 Read (file_read only, no write)
- Each file row is expandable to show the diff/content from the event metadata
- Show count badge on the "Changes" tab: "Changes (5)"

**Files:** `packages/client/src/components/AgentPanel.tsx`

---

### 3. WebSocket Connection Indicator (High Impact)

**Problem:** Users have no visibility into WebSocket connection state. If the connection drops (network issue, server restart), events stop appearing silently. The user doesn't know if the agent is still working or if the connection died.

**Solution:** Add a small connection status indicator in the header. Green dot = connected, red dot with "Reconnecting..." = disconnected.

**Implementation:**
- `api.ts`: Export a `useConnectionStatus` hook or a reactive status:
  - Add a `connectionStatus` variable: `'connected' | 'disconnected' | 'reconnecting'`
  - Set to `'connected'` in `ws.onopen`
  - Set to `'reconnecting'` in `ws.onclose` (when auto-reconnect kicks in)
  - Export a `subscribeConnectionStatus` function for React components
- `hooks/useConnectionStatus.ts`: New hook that subscribes to connection state changes
- `Header.tsx`: Add a small status dot next to the title
  - Green pulsing dot + "Connected" tooltip when connected
  - Red dot + "Reconnecting..." text when disconnected
  - Appears only after first disconnect (don't show green dot on initial load — unnecessary noise)

**Files:** `packages/client/src/lib/api.ts`, `packages/client/src/hooks/useConnectionStatus.ts` (new), `packages/client/src/components/Header.tsx`

---

### 4. Recently Used Repo Paths (Medium Impact)

**Problem:** Users retype the same repo path (`/host-projects/my-app`) every time they configure a task. The app saves the last path in localStorage but doesn't offer a dropdown of recent paths.

**Solution:** Save the last 5 unique repo paths in localStorage and show them as a dropdown/datalist on repo path inputs.

**Implementation:**
- `lib/repo-history.ts` (new): Utility module
  - `getRecentRepoPaths(): string[]` — reads from localStorage, returns up to 5
  - `addRepoPath(path: string): void` — adds to front, deduplicates, caps at 5
  - localStorage key: `kanban-recent-repo-paths`
- `WorktreeDialog.tsx`: Add `<datalist>` linked to the repo path input with recent paths as options. Call `addRepoPath` on submit.
- `TaskDialog.tsx`: Same datalist on the repo path field (from item #1)
- `TaskGroupDialog.tsx`: Same datalist on the group repo path field

**Files:** `packages/client/src/lib/repo-history.ts` (new), `packages/client/src/components/WorktreeDialog.tsx`, `packages/client/src/components/TaskDialog.tsx`, `packages/client/src/components/TaskGroupDialog.tsx`

---

### 5. Better Empty States (Medium Impact)

**Problem:** Empty columns show a generic "No tasks" message with no guidance. New users see 4 empty columns and don't know what to do.

**Solution:** Column-specific empty state messages with contextual hints.

**Implementation:**
- `Column.tsx`: Replace the generic "No tasks" text with column-specific messages:
  - **Backlog**: "Press **N** to create a task or **G** for a group"
  - **In Progress**: "Drag tasks here to start AI agents"
  - **Review**: "Completed tasks appear here for review"
  - **Done**: "Move reviewed tasks here when finished"
- Pass the column ID to the empty state renderer
- Use slightly larger text and a subtle call-to-action style for Backlog (since that's where users start)

**Files:** `packages/client/src/components/Column.tsx`

---

### 6. Group Editing (Medium Impact)

**Problem:** After creating a group, users can't edit its title, description, or priority. Standalone tasks have an edit button (pencil icon) but groups don't.

**Solution:** Add an edit button to TaskGroupCard that opens the group in an edit dialog.

**Implementation:**
- `TaskGroupCard.tsx`: Add edit (pencil) button in the hover actions bar, alongside run/stop/delete
- `TaskGroupDialog.tsx`: Add edit mode support (similar to how TaskDialog has `editTask` prop):
  - New prop: `editGroup?: TaskGroupWithChildren`
  - When set, pre-populate all fields from the existing group
  - Show "Save Changes" instead of "Create Group"
  - Don't allow adding/removing children while in edit mode (just edit title, description, priority, maxConcurrency)
  - Call `updateGroup` on submit instead of `createGroup`
- `App.tsx`: Add `editingGroup` state, wire edit handler from Board → TaskGroupDialog

**Files:** `packages/client/src/components/TaskGroupCard.tsx`, `packages/client/src/components/TaskGroupDialog.tsx`, `packages/client/src/App.tsx`

---

## Implementation Order

| Phase | Item | Effort |
|-------|------|--------|
| 1 | #5 Better empty states | Small — text changes only |
| 2 | #4 Recent repo paths | Small — new utility + datalist |
| 3 | #3 WebSocket connection indicator | Small — new hook + header dot |
| 4 | #1 Repo path in TaskDialog | Medium — form expansion + conditional fields |
| 5 | #6 Group editing | Medium — edit mode in dialog |
| 6 | #2 File change summary | Medium — new tab with event extraction logic |

Start with quick wins (#5, #4, #3) then tackle the larger items (#1, #6, #2).
