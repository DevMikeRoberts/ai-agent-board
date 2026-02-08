import type { Task, Column, AgentEvent } from '@/types';

export const columns: Column[] = [
  { id: 'backlog', title: 'Backlog', color: 'bg-zinc-500', icon: 'inbox' },
  { id: 'in-progress', title: 'In Progress', color: 'bg-blue-500', icon: 'loader' },
  { id: 'review', title: 'Review', color: 'bg-amber-500', icon: 'eye' },
  { id: 'done', title: 'Done', color: 'bg-emerald-500', icon: 'check-circle' },
];

export const mockTasks: Task[] = [
  {
    id: 'task-1',
    title: 'Set up authentication middleware',
    description:
      'Implement JWT-based authentication middleware for the Express API. Should validate tokens on protected routes and attach user info to the request object.',
    priority: 'high',
    columnId: 'backlog',
    agentStatus: 'idle',
    createdAt: Date.now() - 86400000 * 3,
  },
  {
    id: 'task-2',
    title: 'Create user profile API endpoint',
    description:
      'Build GET /api/users/:id and PATCH /api/users/:id endpoints. Include validation with zod schemas and proper error responses.',
    priority: 'medium',
    columnId: 'backlog',
    agentStatus: 'idle',
    createdAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'task-3',
    title: 'Implement WebSocket event streaming',
    description:
      'Set up WebSocket server with ws library. Broadcast agent events to connected clients in real-time. Handle reconnection and error states.',
    priority: 'critical',
    columnId: 'in-progress',
    agentStatus: 'executing',
    createdAt: Date.now() - 86400000,
    startedAt: Date.now() - 300000,
  },
  {
    id: 'task-4',
    title: 'Add rate limiting to API routes',
    description:
      'Use express-rate-limit to add rate limiting. Configure different limits for auth vs public routes. Return proper 429 responses.',
    priority: 'low',
    columnId: 'in-progress',
    agentStatus: 'planning',
    createdAt: Date.now() - 86400000 * 2,
    startedAt: Date.now() - 120000,
  },
  {
    id: 'task-5',
    title: 'Write integration tests for task CRUD',
    description:
      'Create comprehensive integration tests for all task endpoints using supertest. Cover edge cases and error scenarios.',
    priority: 'medium',
    columnId: 'review',
    agentStatus: 'complete',
    createdAt: Date.now() - 86400000 * 4,
    startedAt: Date.now() - 86400000,
    completedAt: Date.now() - 3600000,
  },
  {
    id: 'task-6',
    title: 'Configure Docker multi-stage build',
    description:
      'Create Dockerfile with multi-stage build for production. Optimize image size with Alpine base. Add docker-compose for local development.',
    priority: 'high',
    columnId: 'done',
    agentStatus: 'complete',
    createdAt: Date.now() - 86400000 * 5,
    startedAt: Date.now() - 86400000 * 2,
    completedAt: Date.now() - 86400000,
  },
];

const simulatedEvents: Omit<AgentEvent, 'id' | 'taskId' | 'timestamp'>[] = [
  {
    type: 'thinking',
    content: 'Analyzing the task requirements. I need to set up a WebSocket server using the `ws` library and create an event broadcasting system...',
  },
  {
    type: 'thinking',
    content: 'Planning the implementation:\n1. Install ws dependency\n2. Create WebSocket server module\n3. Define event types and interfaces\n4. Implement broadcast logic\n5. Add reconnection handling',
  },
  {
    type: 'command',
    content: 'npm install ws @types/ws',
    metadata: { command: 'npm install ws @types/ws' },
  },
  {
    type: 'output',
    content: 'added 2 packages in 1.2s',
  },
  {
    type: 'file_edit',
    content: 'Creating WebSocket server module',
    metadata: {
      file: 'packages/server/src/websocket.ts',
      language: 'typescript',
      diff: `+import { WebSocketServer, WebSocket } from 'ws';
+import { Server } from 'http';
+
+interface AgentEvent {
+  taskId: string;
+  type: 'thinking' | 'tool_call' | 'file_edit' | 'command' | 'output';
+  content: string;
+  timestamp: number;
+}
+
+export function createWSS(server: Server) {
+  const wss = new WebSocketServer({ server, path: '/ws' });
+
+  wss.on('connection', (ws) => {
+    console.log('Client connected');
+    ws.on('close', () => console.log('Client disconnected'));
+  });
+
+  return {
+    broadcast(event: AgentEvent) {
+      const data = JSON.stringify(event);
+      wss.clients.forEach((client) => {
+        if (client.readyState === WebSocket.OPEN) {
+          client.send(data);
+        }
+      });
+    },
+  };
+}`,
    },
  },
  {
    type: 'file_edit',
    content: 'Integrating WebSocket with Express server',
    metadata: {
      file: 'packages/server/src/index.ts',
      language: 'typescript',
      diff: `+import { createServer } from 'http';
+import { createWSS } from './websocket';
+
 const app = express();
+const server = createServer(app);
+const wss = createWSS(server);
+
-app.listen(3001);
+server.listen(3001, () => {
+  console.log('Server running on port 3001');
+});`,
    },
  },
  {
    type: 'thinking',
    content: 'Now adding error handling and reconnection support. I should also add heartbeat pings to detect stale connections...',
  },
  {
    type: 'file_edit',
    content: 'Adding heartbeat and error handling',
    metadata: {
      file: 'packages/server/src/websocket.ts',
      language: 'typescript',
      diff: `+  // Heartbeat to detect stale connections
+  const interval = setInterval(() => {
+    wss.clients.forEach((ws) => {
+      if (!ws.isAlive) return ws.terminate();
+      ws.isAlive = false;
+      ws.ping();
+    });
+  }, 30000);
+
+  wss.on('close', () => clearInterval(interval));`,
    },
  },
  {
    type: 'command',
    content: 'npx tsc --noEmit',
    metadata: { command: 'npx tsc --noEmit' },
  },
  {
    type: 'output',
    content: '✓ No type errors found',
  },
  {
    type: 'complete',
    content: 'WebSocket event streaming implementation complete. Created websocket.ts with broadcast support, heartbeat pings, and integrated with the Express server.',
  },
];

export function getSimulatedEvents(taskId: string): AgentEvent[] {
  return simulatedEvents.map((event, index) => ({
    ...event,
    id: `evt-${taskId}-${index}`,
    taskId,
    timestamp: Date.now() - (simulatedEvents.length - index) * 5000,
  }));
}

export function streamSimulatedEvents(
  taskId: string,
  onEvent: (event: AgentEvent) => void
): () => void {
  let index = 0;
  let cancelled = false;

  const next = () => {
    if (cancelled || index >= simulatedEvents.length) return;
    const event: AgentEvent = {
      ...simulatedEvents[index],
      id: `evt-${taskId}-${index}`,
      taskId,
      timestamp: Date.now(),
    };
    onEvent(event);
    index++;
    if (index < simulatedEvents.length) {
      const delay = 800 + Math.random() * 2000;
      setTimeout(next, delay);
    }
  };

  setTimeout(next, 500);
  return () => { cancelled = true; };
}
