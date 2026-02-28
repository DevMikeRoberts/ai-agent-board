import Database from 'better-sqlite3';
import type { TaskTemplate, Priority, AgentType } from '../types.js';
import type { TemplateRepository } from './template-types.js';

interface TemplateRow {
  id: string;
  name: string;
  title: string;
  description: string;
  priority: Priority;
  agent_type: AgentType;
  repo_path: string | null;
  base_branch: string | null;
  use_worktree: number | null;
  created_at: number;
}

function rowToTemplate(row: TemplateRow): TaskTemplate {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    description: row.description,
    priority: row.priority,
    agentType: row.agent_type,
    repoPath: row.repo_path ?? undefined,
    baseBranch: row.base_branch ?? undefined,
    useWorktree: row.use_worktree != null ? Boolean(row.use_worktree) : undefined,
    createdAt: row.created_at,
  };
}

export class SqliteTemplateRepository implements TemplateRepository {
  private stmts: {
    getAll: Database.Statement;
    getById: Database.Statement;
    insert: Database.Statement;
    delete: Database.Statement;
  };

  constructor(private db: Database.Database) {
    this.stmts = {
      getAll: db.prepare('SELECT * FROM templates ORDER BY created_at DESC'),
      getById: db.prepare('SELECT * FROM templates WHERE id = ?'),
      insert: db.prepare(`
        INSERT INTO templates (id, name, title, description, priority, agent_type, repo_path, base_branch, use_worktree, created_at)
        VALUES (@id, @name, @title, @description, @priority, @agent_type, @repo_path, @base_branch, @use_worktree, @created_at)
      `),
      delete: db.prepare('DELETE FROM templates WHERE id = ?'),
    };
  }

  async getAll(): Promise<TaskTemplate[]> {
    return (this.stmts.getAll.all() as TemplateRow[]).map(rowToTemplate);
  }

  async getById(id: string): Promise<TaskTemplate | undefined> {
    const row = this.stmts.getById.get(id) as TemplateRow | undefined;
    return row ? rowToTemplate(row) : undefined;
  }

  async create(template: TaskTemplate): Promise<TaskTemplate> {
    this.stmts.insert.run({
      id: template.id,
      name: template.name,
      title: template.title,
      description: template.description,
      priority: template.priority,
      agent_type: template.agentType,
      repo_path: template.repoPath ?? null,
      base_branch: template.baseBranch ?? null,
      use_worktree: template.useWorktree != null ? (template.useWorktree ? 1 : 0) : null,
      created_at: template.createdAt,
    });
    return template;
  }

  async update(id: string, updates: Partial<Omit<TaskTemplate, 'id' | 'createdAt'>>): Promise<TaskTemplate | undefined> {
    const existing = this.stmts.getById.get(id) as TemplateRow | undefined;
    if (!existing) return undefined;

    const fields: string[] = [];
    const values: Record<string, unknown> = { id };

    if (updates.name !== undefined) { fields.push('name = @name'); values.name = updates.name; }
    if (updates.title !== undefined) { fields.push('title = @title'); values.title = updates.title; }
    if (updates.description !== undefined) { fields.push('description = @description'); values.description = updates.description; }
    if (updates.priority !== undefined) { fields.push('priority = @priority'); values.priority = updates.priority; }
    if (updates.agentType !== undefined) { fields.push('agent_type = @agent_type'); values.agent_type = updates.agentType; }
    if (updates.repoPath !== undefined) { fields.push('repo_path = @repo_path'); values.repo_path = updates.repoPath ?? null; }
    if (updates.baseBranch !== undefined) { fields.push('base_branch = @base_branch'); values.base_branch = updates.baseBranch ?? null; }
    if (updates.useWorktree !== undefined) { fields.push('use_worktree = @use_worktree'); values.use_worktree = updates.useWorktree != null ? (updates.useWorktree ? 1 : 0) : null; }

    if (fields.length === 0) return rowToTemplate(existing);

    this.db.prepare(`UPDATE templates SET ${fields.join(', ')} WHERE id = @id`).run(values);
    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = this.stmts.delete.run(id);
    return result.changes > 0;
  }
}
