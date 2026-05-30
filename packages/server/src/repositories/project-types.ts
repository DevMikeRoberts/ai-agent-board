import type { Project } from '../types.js';

export interface ProjectRepository {
  getAllWithCounts(): Promise<Project[]>;
  getById(id: string): Promise<Project | undefined>;
  getDefault(): Promise<Project | undefined>;
  create(input: {
    id: string;
    name: string;
    repoPath?: string;
    createdAt: number;
    updatedAt: number;
  }): Promise<Project>;
  update(id: string, updates: {
    name?: string;
    repoPath?: string | null;
    updatedAt: number;
  }): Promise<Project | undefined>;
  hasTasksOrGroups(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}
