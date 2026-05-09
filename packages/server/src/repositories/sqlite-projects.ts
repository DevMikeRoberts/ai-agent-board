import Database from 'better-sqlite3';
import type { ColumnId, Project, ProjectTaskCounts } from '../types.js';
import type { ProjectRepository } from './project-types.js';

interface ProjectRow {
  id: string;
  name: string;
  repo_path: string | null;
  is_default: number;
  created_at: number;
  updated_at: number;
}

interface CountRow {
  column_id: ColumnId;
  count: number;
}

function emptyCounts(): ProjectTaskCounts {
  return { backlog: 0, 'in-progress': 0, review: 0, done: 0, total: 0 };
}

function rowToProject(row: ProjectRow, taskCounts?: ProjectTaskCounts): Project {
  return {
    id: row.id,
    name: row.name,
    repoPath: row.repo_path ?? undefined,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(taskCounts ? { taskCounts } : {}),
  };
}

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly db: Database.Database) {}

  async getAllWithCounts(): Promise<Project[]> {
    const rows = this.db.prepare(`SELECT * FROM projects ORDER BY CASE WHEN id = 'default' THEN 0 ELSE 1 END, created_at ASC`).all() as ProjectRow[];
    return rows.map((row) => rowToProject(row, this.getCounts(row.id)));
  }

  async getById(id: string): Promise<Project | undefined> {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
    return row ? rowToProject(row, this.getCounts(row.id)) : undefined;
  }

  async getDefault(): Promise<Project | undefined> {
    return this.getById('default');
  }

  async create(input: {
    id: string;
    name: string;
    repoPath?: string;
    createdAt: number;
    updatedAt: number;
  }): Promise<Project> {
    return this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO projects (id, name, repo_path, is_default, created_at, updated_at)
        VALUES (@id, @name, @repo_path, @is_default, @created_at, @updated_at)
      `).run({
        id: input.id,
        name: input.name,
        repo_path: input.repoPath ?? null,
        is_default: 0,
        created_at: input.createdAt,
        updated_at: input.updatedAt,
      });
      const created = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(input.id) as ProjectRow;
      return rowToProject(created, this.getCounts(input.id));
    })();
  }

  async update(id: string, updates: {
    name?: string;
    repoPath?: string | null;
    updatedAt: number;
  }): Promise<Project | undefined> {
    return this.db.transaction(() => {
      const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
      if (!row) return undefined;
      const merged = {
        id,
        name: updates.name ?? row.name,
        repo_path: updates.repoPath === undefined ? row.repo_path : updates.repoPath,
        is_default: row.is_default,
        updated_at: updates.updatedAt,
      };
      this.db.prepare(`
        UPDATE projects
        SET name = @name, repo_path = @repo_path, is_default = @is_default, updated_at = @updated_at
        WHERE id = @id
      `).run(merged);
      const updated = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow;
      return rowToProject(updated, this.getCounts(id));
    })();
  }

  async hasTasksOrGroups(id: string): Promise<boolean> {
    const taskCount = (this.db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE project_id = ?').get(id) as { count: number }).count;
    if (taskCount > 0) return true;
    const groupCount = (this.db.prepare('SELECT COUNT(*) AS count FROM task_groups WHERE project_id = ?').get(id) as { count: number }).count;
    return groupCount > 0;
  }

  async delete(id: string): Promise<boolean> {
    if (id === 'default') return false;
    return this.db.transaction(() => {
      const project = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
      if (!project) return false;
      const taskCount = (this.db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE project_id = ?').get(id) as { count: number }).count;
      const groupCount = (this.db.prepare('SELECT COUNT(*) AS count FROM task_groups WHERE project_id = ?').get(id) as { count: number }).count;
      if (taskCount > 0 || groupCount > 0) return false;
      const result = this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
      if (project.is_default) {
        this.db.prepare('UPDATE projects SET is_default = 1 WHERE id = ?').run('default');
      }
      return result.changes > 0;
    })();
  }

  private getCounts(projectId: string): ProjectTaskCounts {
    const counts = emptyCounts();
    const taskRows = this.db.prepare(`
      SELECT column_id, COUNT(*) AS count
      FROM tasks
      WHERE project_id = ? AND archived = 0 AND group_id IS NULL
      GROUP BY column_id
    `).all(projectId) as CountRow[];
    const groupRows = this.db.prepare(`
      SELECT column_id, COUNT(*) AS count
      FROM task_groups
      WHERE project_id = ? AND archived = 0
      GROUP BY column_id
    `).all(projectId) as CountRow[];
    for (const row of [...taskRows, ...groupRows]) {
      counts[row.column_id] += row.count;
      counts.total += row.count;
    }
    return counts;
  }
}
