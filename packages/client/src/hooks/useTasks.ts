import { useState, useCallback, useEffect, useRef } from 'react';
import type { Task, ColumnId } from '@/types';
import { api, connectWS } from '@/lib/api';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const loaded = useRef(false);

  // Fetch tasks on mount
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    api.getTasks().then(setTasks).catch(console.error);
  }, []);

  // WebSocket: live task updates from server
  useEffect(() => {
    return connectWS((msg) => {
      if (msg.type === 'task_updated') {
        const updated = msg.payload as Task;
        setTasks((prev) => {
          const exists = prev.some((t) => t.id === updated.id);
          if (exists) return prev.map((t) => (t.id === updated.id ? updated : t));
          return [...prev, updated];
        });
      }
    });
  }, []);

  const addTask = useCallback(async (task: Omit<Task, 'id' | 'createdAt' | 'agentStatus'>) => {
    const newTask = await api.createTask(task);
    setTasks((prev) => [...prev, newTask]);
    return newTask;
  }, []);

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    const updated = await api.updateTask(id, updates);
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
  }, []);

  const validTransitions: Record<ColumnId, ColumnId[]> = {
    'backlog': ['in-progress'],
    'in-progress': ['review'],
    'review': ['done', 'in-progress'],
    'done': [],
  };

  const moveTask = useCallback((taskId: string, targetColumn: ColumnId) => {
    setTasks((prev) => {
      const task = prev.find((t) => t.id === taskId);
      if (!task) return prev;
      // Block invalid transitions
      if (!validTransitions[task.columnId]?.includes(targetColumn)) return prev;

      return prev.map((t) => {
        if (t.id !== taskId) return t;
        const updates: Partial<Task> = { columnId: targetColumn };
        // Reset agent state when moving to in-progress
        if (targetColumn === 'in-progress') {
          updates.agentStatus = 'idle';
          updates.startedAt = undefined;
          updates.completedAt = undefined;
        }
        return { ...t, ...updates };
      });
    });
    // Sync to server (server also validates + resets)
    api.updateTask(taskId, { columnId: targetColumn }).catch((err) => {
      console.error('[moveTask] server rejected:', err);
      // Revert on failure by re-fetching
      api.getTasks().then(setTasks).catch(console.error);
    });
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    await api.deleteTask(id);
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }, []);

  const runTask = useCallback(async (id: string) => {
    const updated = await api.runTask(id);
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
  }, []);

  const stopTask = useCallback(async (id: string) => {
    const updated = await api.stopTask(id);
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
  }, []);

  const getTasksByColumn = useCallback(
    (columnId: ColumnId) => tasks.filter((t) => t.columnId === columnId),
    [tasks]
  );

  return { tasks, addTask, updateTask, moveTask, deleteTask, runTask, stopTask, getTasksByColumn };
}
