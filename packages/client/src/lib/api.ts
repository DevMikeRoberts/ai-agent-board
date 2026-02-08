import type { Task, AgentEvent, ColumnId, Priority } from '@/types';

const BASE = '/api';

async function request<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// --- Task CRUD ---

export const api = {
  getTasks: () => request<Task[]>('/tasks'),

  createTask: (data: { title: string; description: string; priority: Priority; columnId: ColumnId }) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),

  updateTask: (id: string, data: Partial<Task>) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteTask: (id: string) =>
    request<void>(`/tasks/${id}`, { method: 'DELETE' }),

  runTask: (id: string) =>
    request<Task>(`/tasks/${id}/run`, { method: 'POST' }),

  stopTask: (id: string) =>
    request<Task>(`/tasks/${id}/stop`, { method: 'POST' }),

  getEvents: (id: string) =>
    request<AgentEvent[]>(`/tasks/${id}/events`),
};

// --- WebSocket ---

export type WSMessageHandler = (msg: { type: string; payload: any }) => void;

export function connectWS(onMessage: WSMessageHandler): () => void {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws`;

  let ws: WebSocket;
  let disposed = false;
  let reconnectTimer: ReturnType<typeof setTimeout>;

  function connect() {
    if (disposed) return;
    ws = new WebSocket(url);

    ws.onopen = () => console.log('[WS] connected');

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        onMessage(msg);
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      if (!disposed) {
        console.log('[WS] disconnected, reconnecting in 2s');
        reconnectTimer = setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => ws.close();
  }

  connect();

  return () => {
    disposed = true;
    clearTimeout(reconnectTimer);
    ws?.close();
  };
}
