import type { Task } from '../types.js';
import type { TaskRepository } from '../repositories/types.js';
import type { AgentManager } from './agent-manager.js';
import { MAX_REVIEW_ROUNDS } from '@ai-agent-board/shared/constants.js';
import { errorMessage } from '../utils.js';
import { broadcastTaskUpdate, startAgentForTask } from '../routes/helpers.js';

/**
 * Post-completion pipeline: after an agent finishes a standalone task, open a
 * PR for its branch, run an adversarial review of the diff with a *different*
 * agent, then either auto-merge (approve) or bounce the task back to in-progress
 * with the feedback appended to its description and re-run the implementer —
 * looping until approved or MAX_REVIEW_ROUNDS is hit, after which it's handed
 * back to a human.
 *
 * Returns a hook suitable for AgentManager.registerCompletionHook(). Each agent
 * completion fires one pass; the re-run loop re-enters via the same hook, so a
 * pass never awaits a re-run — it reads fresh task state (incl. reviewRound)
 * from the DB on every invocation.
 */
export function createReviewPipeline(
  repo: TaskRepository,
  agentManager: AgentManager,
): (taskId: string) => Promise<void> {
  async function update(id: string, patch: Partial<Task>): Promise<Task | undefined> {
    const t = await repo.update(id, patch);
    if (t) broadcastTaskUpdate(t);
    return t;
  }

  return async function runReviewPipeline(taskId: string): Promise<void> {
    const task = await repo.getById(taskId);
    // Only standalone tasks with a real branch get the pipeline. A task run
    // without a worktree has no branch to PR/review — leave it in review.
    if (!task || task.groupId || task.archived) return;
    if (!task.repoPath || !task.branchName) return;

    try {
      const remote = agentManager.hasRemote(task);

      // 1) Open (or reuse) the PR.
      let prUrl = task.prUrl;
      if (remote) {
        await update(taskId, { reviewStatus: 'opening_pr' });
        const { url } = agentManager.createPR(task);
        prUrl = url;
        await update(taskId, { prUrl });
        agentManager.emitPipelineEvent(taskId, 'output', `Opened pull request: ${url}`);
      } else {
        agentManager.emitPipelineEvent(
          taskId, 'output',
          'No GitHub remote — reviewing the local branch diff and merging locally on approval.',
        );
      }

      // 2) Adversarial review of the diff.
      const reviewer = agentManager.pickReviewerAgent(task.agentType);
      if (!reviewer) {
        agentManager.emitPipelineEvent(taskId, 'error', 'No agent available to review — left for manual review.');
        await update(taskId, { reviewStatus: 'needs_human' });
        return;
      }
      const diff = agentManager.getReviewDiff(task, remote);
      if (!diff.trim()) {
        agentManager.emitPipelineEvent(taskId, 'error', 'No changes found on the branch to review — left for manual review.');
        await update(taskId, { reviewStatus: 'needs_human' });
        return;
      }

      await update(taskId, { reviewStatus: 'reviewing' });
      agentManager.emitPipelineEvent(taskId, 'output', `Adversarial review by ${reviewer}…`);
      const verdict = await agentManager.runAdversarialReview(task, reviewer, diff);

      // 3a) Approved → merge and finish.
      if (verdict.decision === 'approve') {
        await update(taskId, { reviewStatus: 'approved' });
        agentManager.emitPipelineEvent(taskId, 'output', `Review APPROVED by ${reviewer}. Merging…`);
        try {
          if (remote) agentManager.mergePR(task);
          else await agentManager.mergeLocal(task);
        } catch (mergeErr: unknown) {
          agentManager.emitPipelineEvent(taskId, 'error', `Approved, but merge failed: ${errorMessage(mergeErr)}`);
          await update(taskId, { reviewStatus: 'error' });
          return;
        }
        try { agentManager.removeWorktree(task); } catch { /* best effort */ }
        await update(taskId, {
          reviewStatus: 'merged',
          columnId: 'done',
          completedAt: Date.now(),
          worktreePath: undefined,
        });
        agentManager.emitPipelineEvent(taskId, 'complete', 'Merged after passing adversarial review. 🎉');
        return;
      }

      // 3b) Changes requested → append feedback, then loop or hand back.
      const round = (task.reviewRound ?? 0) + 1;
      const feedback = verdict.comments || 'Reviewer requested changes (no details provided).';
      const newDescription = appendReviewFeedback(task.description, round, reviewer, feedback);

      if (round >= MAX_REVIEW_ROUNDS) {
        await update(taskId, {
          description: newDescription,
          reviewRound: round,
          reviewStatus: 'needs_human',
          columnId: 'in-progress',
          agentStatus: 'idle',
          completedAt: undefined,
        });
        agentManager.emitPipelineEvent(
          taskId, 'error',
          `Review round ${round}/${MAX_REVIEW_ROUNDS} still requested changes — handing back to you. Feedback added to the description.`,
        );
        return;
      }

      await update(taskId, {
        description: newDescription,
        reviewRound: round,
        reviewStatus: 'changes_requested',
        columnId: 'in-progress',
      });
      agentManager.emitPipelineEvent(
        taskId, 'output',
        `Review round ${round} requested changes — re-running ${task.agentType ?? 'agent'} to address feedback.`,
      );
      const fresh = await repo.getById(taskId);
      if (fresh) await startAgentForTask(fresh, repo, agentManager);
    } catch (err: unknown) {
      console.error(`[pipeline] failed for task ${taskId}:`, errorMessage(err));
      agentManager.emitPipelineEvent(taskId, 'error', `Auto-review pipeline failed: ${errorMessage(err)}`);
      await update(taskId, { reviewStatus: 'error' }).catch(() => {});
    }
  };
}

/** Append a clearly-delimited review-feedback block to a task description. */
function appendReviewFeedback(description: string, round: number, reviewer: string, feedback: string): string {
  const block = [
    '',
    '---',
    `## 🔁 Review round ${round} — changes requested by ${reviewer}`,
    feedback.trim(),
    '',
    'Address the feedback above. Make the change correct and complete, then finish.',
    '---',
  ].join('\n');
  return `${(description || '').trimEnd()}\n${block}`;
}
