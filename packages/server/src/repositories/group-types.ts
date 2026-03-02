import type { TaskGroup, Task } from '../types.js';

export interface TaskGroupRepository {
  getAll(includeArchived?: boolean): Promise<TaskGroup[]>;
  getById(id: string): Promise<TaskGroup | undefined>;
  create(group: TaskGroup, children: Omit<Task, 'columnId' | 'agentStatus' | 'createdAt'>[]): Promise<{ group: TaskGroup; children: Task[] }>;
  update(id: string, updates: Partial<Omit<TaskGroup, 'id' | 'createdAt'>>): Promise<TaskGroup | undefined>;
  delete(id: string): Promise<boolean>;
  getChildTasks(groupId: string): Promise<Task[]>;
}
