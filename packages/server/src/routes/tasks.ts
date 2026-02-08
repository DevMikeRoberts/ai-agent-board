import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import type { Task, ColumnId, Priority } from '../types.js';
import { broadcast } from '../websocket.js';
import { startAgent, stopAgent, getEvents, isRunning } from '../services/copilot.js';

const router = Router();

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

// In-memory task store
const tasks = new Map<string, Task>();

// Seed some initial tasks
const seeds: Omit<Task, 'id'>[] = [
  {
    title: 'Set up authentication middleware',
    description: 'Implement JWT-based authentication middleware for the Express API. Should validate tokens on protected routes and attach user info to the request object.',
    priority: 'high',
    columnId: 'backlog',
    agentStatus: 'idle',
    createdAt: Date.now() - 86400000 * 3,
  },
  {
    title: 'Create user profile API endpoint',
    description: 'Build GET /api/users/:id and PATCH /api/users/:id endpoints. Include validation with zod schemas and proper error responses.',
    priority: 'medium',
    columnId: 'backlog',
    agentStatus: 'idle',
    createdAt: Date.now() - 86400000 * 2,
  },
  {
    title: 'Implement WebSocket event streaming',
    description: 'Set up WebSocket server with ws library. Broadcast agent events to connected clients in real-time. Handle reconnection and error states.',
    priority: 'critical',
    columnId: 'in-progress',
    agentStatus: 'idle',
    createdAt: Date.now() - 86400000,
  },
  {
    title: 'Write integration tests for task CRUD',
    description: 'Create comprehensive integration tests for all task endpoints using supertest. Cover edge cases and error scenarios.',
    priority: 'medium',
    columnId: 'review',
    agentStatus: 'complete',
    createdAt: Date.now() - 86400000 * 4,
    startedAt: Date.now() - 86400000,
    completedAt: Date.now() - 3600000,
  },
  {
    title: 'Configure Docker multi-stage build',
    description: 'Create Dockerfile with multi-stage build for production. Optimize image size with Alpine base. Add docker-compose for local development.',
    priority: 'high',
    columnId: 'done',
    agentStatus: 'complete',
    createdAt: Date.now() - 86400000 * 5,
    startedAt: Date.now() - 86400000 * 2,
    completedAt: Date.now() - 86400000,
  },
];

seeds.forEach((seed) => {
  const id = uuid();
  tasks.set(id, { ...seed, id });
});

function broadcastTaskUpdate(task: Task): void {
  broadcast({ type: 'task_updated', payload: task });
}

// GET /api/tasks
router.get('/', (_req: Request, res: Response) => {
  res.json(Array.from(tasks.values()));
});

// POST /api/tasks
router.post('/', (req: Request, res: Response) => {
  const { title, description, priority, columnId } = req.body;
  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  const task: Task = {
    id: uuid(),
    title,
    description: description || '',
    priority: (priority as Priority) || 'medium',
    columnId: (columnId as ColumnId) || 'backlog',
    agentStatus: 'idle',
    createdAt: Date.now(),
  };
  tasks.set(task.id, task);
  broadcastTaskUpdate(task);
  res.status(201).json(task);
});

// Valid column transitions
const validTransitions: Record<ColumnId, ColumnId[]> = {
  'backlog': ['in-progress'],
  'in-progress': ['review'],
  'review': ['done', 'in-progress'],
  'done': [],
};

// PATCH /api/tasks/:id
router.patch('/:id', (req: Request, res: Response) => {
  const task = tasks.get(paramId(req));
  if (!task) {
    res.status(404).json({ error: 'task not found' });
    return;
  }

  // Validate column transition if columnId is changing
  const newColumnId = req.body.columnId as ColumnId | undefined;
  if (newColumnId && newColumnId !== task.columnId) {
    const allowed = validTransitions[task.columnId];
    if (!allowed.includes(newColumnId)) {
      res.status(400).json({ error: `Cannot move from ${task.columnId} to ${newColumnId}` });
      return;
    }
  }

  const allowedFields = ['title', 'description', 'priority', 'columnId', 'agentStatus'] as const;
  for (const key of allowedFields) {
    if (req.body[key] !== undefined) {
      (task as any)[key] = req.body[key];
    }
  }

  // Reset agent state when moved to in-progress
  if (newColumnId === 'in-progress') {
    task.agentStatus = 'idle';
    task.startedAt = undefined;
    task.completedAt = undefined;
  }

  tasks.set(task.id, task);
  broadcastTaskUpdate(task);
  res.json(task);
});

// DELETE /api/tasks/:id
router.delete('/:id', (req: Request, res: Response) => {
  if (!tasks.has(paramId(req))) {
    res.status(404).json({ error: 'task not found' });
    return;
  }
  tasks.delete(paramId(req));
  res.status(204).send();
});

// POST /api/tasks/:id/run
router.post('/:id/run', (req: Request, res: Response) => {
  const task = tasks.get(paramId(req));
  if (!task) {
    res.status(404).json({ error: 'task not found' });
    return;
  }
  if (isRunning(task.id)) {
    res.status(409).json({ error: 'agent already running for this task' });
    return;
  }
  task.agentStatus = 'planning';
  task.startedAt = Date.now();
  task.completedAt = undefined;
  if (task.columnId === 'backlog') {
    task.columnId = 'in-progress';
  }
  tasks.set(task.id, task);
  broadcastTaskUpdate(task);

  startAgent(task, (status) => {
    const t = tasks.get(task.id);
    if (!t) return;
    t.agentStatus = status;
    if (status === 'complete') {
      t.completedAt = Date.now();
      t.columnId = 'review';
    }
    tasks.set(t.id, t);
    broadcastTaskUpdate(t);
  });

  res.json(task);
});

// POST /api/tasks/:id/stop
router.post('/:id/stop', (req: Request, res: Response) => {
  const task = tasks.get(paramId(req));
  if (!task) {
    res.status(404).json({ error: 'task not found' });
    return;
  }
  const stopped = stopAgent(task.id);
  if (!stopped) {
    res.status(409).json({ error: 'no running agent for this task' });
    return;
  }
  task.agentStatus = 'failed';
  tasks.set(task.id, task);
  broadcastTaskUpdate(task);
  res.json(task);
});

// GET /api/tasks/:id/events
router.get('/:id/events', (req: Request, res: Response) => {
  if (!tasks.has(paramId(req))) {
    res.status(404).json({ error: 'task not found' });
    return;
  }
  res.json(getEvents(paramId(req)));
});

export default router;
