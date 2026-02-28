import type { TaskTemplate } from '../types.js';

export interface TemplateRepository {
  getAll(): Promise<TaskTemplate[]>;
  getById(id: string): Promise<TaskTemplate | undefined>;
  create(template: TaskTemplate): Promise<TaskTemplate>;
  update(id: string, updates: Partial<Omit<TaskTemplate, 'id' | 'createdAt'>>): Promise<TaskTemplate | undefined>;
  delete(id: string): Promise<boolean>;
}
