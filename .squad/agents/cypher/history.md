# Cypher History

## Seed Context

- Project: ai-agent-board.
- Optional API key auth uses `API_KEY` server-side and `VITE_API_KEY` client-side.
- Repo access is constrained by `ALLOWED_REPO_ROOTS`.
- Agent work can involve shell commands, worktrees, and path rewriting.
- User: Copilot.

## Learnings

- Security reviews should focus on auth bypass, WebSocket auth, path traversal, worktree escape, and secrets in agent logs/events.
- Denied unsafe operations should surface explicit errors rather than silent fallbacks.
- 2026-05-08T16:37:11.274-07:00: Projects expand repo-path entry and default-scope behavior; review must verify server-side path locks, immutable project scope, and tests that reject mismatched or relative paths.
- 2026-05-08T16:37:11.274-07:00: Fixed Projects security rejection by making default scope immutable, rejecting relative manual group repo paths, locking project repoPath after scoped resources exist, enforcing task/group projectId immutability and locked repoPath on configure/update, and adding SQLite project FK repair/rebuild.
