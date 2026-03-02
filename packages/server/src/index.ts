import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { createWSS } from './websocket.js';
import { initDatabase, initPostgresDatabase, isPostgresUrl } from './db.js';
import { SqliteTaskRepository } from './repositories/sqlite.js';
import { PostgresTaskRepository } from './repositories/postgres.js';
import { createTaskRouter } from './routes/tasks.js';
import { createAgentRouter } from './routes/agent.js';
import { createGitRouter } from './routes/git.js';
import { createTemplateRouter } from './routes/templates.js';
import { createGroupsRouter } from './routes/groups.js';
import { AgentManager } from './services/agent-manager.js';
import { authMiddleware } from './middleware/auth.js';
import type { TaskRepository } from './repositories/types.js';
import type { TemplateRepository } from './repositories/template-types.js';
import type { TaskGroupRepository } from './repositories/group-types.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:4175,http://localhost:4176').split(',');
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: '100kb' }));

// API key auth — when API_KEY env var is set, all /api routes require
// Authorization: Bearer <key>. When unset, auth is skipped (local dev).
app.use('/api', authMiddleware);

const DATABASE_URL = process.env.DATABASE_URL;

let taskRepo: TaskRepository;
let templateRepo: TemplateRepository;
let groupRepo: TaskGroupRepository;
let cleanupDb: () => void;

// Initialize AgentManager
const agentManager = new AgentManager();

(async () => {
  if (isPostgresUrl(DATABASE_URL)) {
    // PostgreSQL backend
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: DATABASE_URL });
    await initPostgresDatabase(pool);
    taskRepo = new PostgresTaskRepository(pool);
    const { PostgresTemplateRepository } = await import('./repositories/postgres-templates.js');
    templateRepo = new PostgresTemplateRepository(pool);
    const { PostgresTaskGroupRepository } = await import('./repositories/postgres-groups.js');
    groupRepo = new PostgresTaskGroupRepository(pool);
    cleanupDb = () => { pool.end(); };
    console.log('[server] using PostgreSQL backend');
  } else {
    // SQLite fallback
    const db = initDatabase();
    taskRepo = new SqliteTaskRepository(db);
    const { SqliteTemplateRepository } = await import('./repositories/sqlite-templates.js');
    templateRepo = new SqliteTemplateRepository(db);
    const { SqliteTaskGroupRepository } = await import('./repositories/sqlite-groups.js');
    groupRepo = new SqliteTaskGroupRepository(db);
    cleanupDb = () => { db.close(); };
    console.log('[server] using SQLite backend');
  }

  agentManager.initEventPersistence(taskRepo);

  app.use('/api/tasks', createTaskRouter(taskRepo, agentManager));
  app.use('/api/tasks', createAgentRouter(taskRepo, agentManager));
  app.use('/api/tasks', createGitRouter(taskRepo, agentManager));
  app.use('/api/templates', createTemplateRouter(templateRepo));
  app.use('/api/groups', createGroupsRouter(groupRepo, taskRepo, agentManager));

  // GET /api/agents — list available agents
  app.get('/api/agents', (_req, res) => {
    res.json(agentManager.getAvailableAgents());
  });

  // Health check (no auth required)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  const server = createServer(app);
  createWSS(server);

  await agentManager.initialize();


  // Recover tasks orphaned by a previous server restart.
  // Any task stuck in 'planning' or 'executing' has no live agent session —
  // reset to 'failed' so they're not permanently frozen.
  const allTasks = await taskRepo.getAll();
  const orphaned = allTasks.filter(t =>
    t.agentStatus === 'planning' || t.agentStatus === 'executing'
  );
  for (const task of orphaned) {
    await taskRepo.update(task.id, {
      agentStatus: 'failed',
      completedAt: Date.now(),
    });
    console.warn(`[server] recovered orphaned task ${task.id} "${task.title}" (was ${task.agentStatus})`);
  }

  server.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
    console.log(`[server] WebSocket at ws://localhost:${PORT}/ws`);
    if (process.env.API_KEY) {
      console.log('[server] API key authentication enabled');
    }
  });

  // Graceful shutdown
  function shutdown() {
    console.log('[server] shutting down...');
    agentManager.shutdownAll();
    try { cleanupDb(); } catch (err) { console.error('[server] db cleanup error:', err); }
    server.close(() => process.exit(0));
    setTimeout(() => {
      console.warn('[server] force exit after timeout');
      process.exit(1);
    }, 5_000).unref();
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
})();
