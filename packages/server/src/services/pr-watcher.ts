import { v4 as uuid } from 'uuid';
import type { Task } from '../types.js';
import type { TaskRepository } from '../repositories/types.js';
import type { ProjectRepository } from '../repositories/project-types.js';
import type { AgentManager } from './agent-manager.js';
import { broadcast } from '../websocket.js';
import { broadcastTaskUpdate } from '../routes/helpers.js';
import { errorMessage } from '../utils.js';

/** How often to poll open PRs for tasks waiting in the review column. */
const PR_WATCH_TICK_MS = 60_000;

/**
 * Watches the pull requests opened for completed tasks and drives them to "done"
 * once merged.
 *
 * Every tick it scans tasks sitting in the **review** column with a recorded
 * `prUrl`, asks the GitHub CLI (via {@link AgentManager.getPullRequestState})
 * whether each PR has merged, and when it has:
 *
 *  1. removes the task's worktree (if it somehow survived PR creation),
 *  2. deletes the local branch,
 *  3. moves the task to the **done** column, and
 *  4. emits an informational event on the task timeline.
 *
 * Polling (rather than a GitHub webhook) keeps this self-contained for a board
 * that already shells out to `gh`, and makes it restart-safe: state lives in the
 * task rows, so a fresh process simply resumes watching on its next tick.
 */
export class PrWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private inTick = false;

  constructor(
    private readonly repo: TaskRepository,
    private readonly agentManager: AgentManager,
    private readonly projectRepo: ProjectRepository,
  ) {}

  /** Begin polling. Runs an immediate pass, then every {@link PR_WATCH_TICK_MS}. */
  start(): void {
    this.runTick();
    this.timer = setInterval(() => this.runTick(), PR_WATCH_TICK_MS);
    this.timer.unref?.();
  }

  /** Stop polling (used on shutdown). */
  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Trigger an out-of-band scan now (e.g. right after a PR was auto-opened). */
  poke(): void {
    this.runTick();
  }

  private runTick(): void {
    void this.tick().catch((err) =>
      console.error('[pr-watcher] tick failed:', errorMessage(err)),
    );
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.inTick) return;
    this.inTick = true;
    try {
      const projects = await this.projectRepo.getAllWithCounts();
      for (const project of projects) {
        if (this.stopped) return;
        const tasks = await this.repo.getAll(false, project.id);
        for (const task of tasks) {
          if (this.stopped) return;
          if (task.columnId !== 'review' || !task.prUrl || !task.repoPath) continue;
          await this.checkTask(task);
        }
      }
    } finally {
      this.inTick = false;
    }
  }

  private async checkTask(task: Task): Promise<void> {
    const state = this.agentManager.getPullRequestState(task);
    if (!state || !state.merged) return;
    await this.completeMergedTask(task);
  }

  /** Move a merged-PR task to done and clean up its worktree + local branch. */
  private async completeMergedTask(task: Task): Promise<void> {
    if (task.worktreePath) {
      try { this.agentManager.removeWorktree(task); } catch { /* best effort */ }
    }
    try { await this.agentManager.deleteBranch(task); } catch { /* best effort */ }

    const updated = await this.repo.update(task.id, {
      columnId: 'done',
      worktreePath: undefined,
      completedAt: Date.now(),
    });
    if (updated) broadcastTaskUpdate(updated);

    this.emitNotice(
      task.id,
      `Pull request merged — task moved to Done.` +
      (task.branchName ? ` Cleaned up branch ${task.branchName} and its worktree.` : ''),
      task.agentType,
    );
    console.log(`[pr-watcher] task ${task.id} PR merged → done`);
  }

  /** Persist + broadcast an informational event on a task's timeline. */
  private emitNotice(taskId: string, content: string, agentType?: Task['agentType']): void {
    const event = {
      id: uuid(),
      taskId,
      type: 'output' as const,
      content,
      timestamp: Date.now(),
      metadata: { phase: 'pr-watcher', ...(agentType ? { agentType } : {}) },
    };
    void this.repo.insertEvent(event).catch((err: unknown) =>
      console.error('[pr-watcher] failed to persist notice:', errorMessage(err)),
    );
    broadcast({ type: 'agent_event', payload: event });
  }
}
