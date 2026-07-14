import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import type { Task } from '../types.js';
import type { TaskRepository } from '../repositories/types.js';
import type { ProjectRepository } from '../repositories/project-types.js';
import { broadcast } from '../websocket.js';
import type { AgentManager } from '../services/agent-manager.js';
import { asyncHandler, makeStatusCallback } from './helpers.js';
import { isValidAgentType } from '@ai-agent-board/shared/constants.js';

const SPRINT_PROJECT_ID = '__sprint_planner__';

function buildSystemPrompt(opts: {
  sprintName: string;
  description: string;
  projectId: string;
  agentType: string;
  repoPath?: string;
  baseBranch?: string;
  priority: string;
}): string {
  const { sprintName, description, projectId, agentType, repoPath, baseBranch, priority } = opts;

  return `You are a sprint planner for an AI Kanban board. Your job is to analyze a sprint description and create individual task tickets on the board.

## Sprint Details
- **Sprint Name:** ${sprintName}
- **Project ID:** ${projectId}
- **Default Priority:** ${priority}
${repoPath ? `- **Repo Path:** ${repoPath}` : ''}
${baseBranch ? `- **Base Branch:** ${baseBranch}` : ''}
- **Agent Type for Tasks:** ${agentType}

## Sprint Description
${description}

## Your Task
Break this sprint into clear, actionable implementation tasks. Each task should be:
- Specific enough for an AI coding agent to implement independently
- Ordered by dependency (foundational tasks first)
- Scoped to a single concern

## How to Create Tasks
Use the batch API to create all tasks at once. Run this curl command:

\`\`\`bash
curl -s -X POST http://localhost:${process.env.PORT || '3001'}/api/tasks/batch \\
  -H "Content-Type: application/json" \\
  -d '{
    "tasks": [
      {
        "title": "${sprintName}: Task Title",
        "description": "Detailed description of what to implement",
        "priority": "${priority}",
        "columnId": "backlog",
        "agentType": "${agentType}",
        "projectId": "${projectId}"${repoPath ? `,\n        "repoPath": "${repoPath}"` : ''}${baseBranch ? `,\n        "baseBranch": "${baseBranch}"` : ''}
      }
    ]
  }'
\`\`\`

## Rules
1. Prefix every task title with "${sprintName}: " so they are tagged with the sprint name
2. Use "backlog" as the columnId so tasks appear in the backlog column
3. Each task description should be self-contained with context
4. Create between 3-15 tasks depending on sprint complexity
5. After creating tasks, output a numbered summary of all tasks created
6. If the API call fails, report the error and try again once

Start by analyzing the sprint description, then create the tasks.`;
}

export function createSprintRouter(
  repo: TaskRepository,
  agentManager: AgentManager,
  projectRepo: ProjectRepository,
): Router {
  const router = Router();

  // POST /api/sprint/plan — create a temporary planner task and run the agent
  router.post('/plan', asyncHandler(async (req: Request, res: Response) => {
    const { sprintName, description, agentType, repoPath, baseBranch, priority, projectId } = req.body;

    if (!sprintName || typeof sprintName !== 'string' || !sprintName.trim()) {
      res.status(400).json({ error: 'sprintName is required' });
      return;
    }
    if (!description || typeof description !== 'string' || !description.trim()) {
      res.status(400).json({ error: 'description is required' });
      return;
    }
    if (agentType && !isValidAgentType(agentType)) {
      res.status(400).json({ error: 'invalid agentType' });
      return;
    }

    // Resolve project — fall back to default if not specified
    let resolvedProjectId = SPRINT_PROJECT_ID;
    if (projectId && typeof projectId === 'string') {
      const project = await projectRepo.getById(projectId);
      if (project) resolvedProjectId = project.id;
    }

    const taskId = uuid();
    const task: Task = {
      id: taskId,
      projectId: SPRINT_PROJECT_ID,
      title: `sprint-plan: ${sprintName.slice(0, 80)}`,
      description: '',
      priority: priority || 'medium',
      columnId: 'in-progress',
      agentStatus: 'planning',
      agentType: (agentType as Task['agentType']) || 'opencode',
      createdAt: Date.now(),
      startedAt: Date.now(),
    };

    // Persist the task
    await repo.create(task);
    broadcast({ type: 'task_updated', payload: task });

    // Inject the system prompt as a thinking event
    const systemPrompt = buildSystemPrompt({
      sprintName: sprintName.trim(),
      description: description.trim(),
      projectId: resolvedProjectId,
      agentType: task.agentType || 'opencode',
      repoPath,
      baseBranch,
      priority: priority || 'medium',
    });

    const contextEvent = {
      id: uuid(),
      taskId,
      type: 'thinking' as const,
      content: systemPrompt,
      timestamp: Date.now(),
    };
    await repo.insertEvent(contextEvent);
    broadcast({ type: 'agent_event', payload: contextEvent });

    // Start the agent
    agentManager.startAgent(task, makeStatusCallback(repo, taskId, agentManager));

    res.json({ taskId });
  }));

  return router;
}
