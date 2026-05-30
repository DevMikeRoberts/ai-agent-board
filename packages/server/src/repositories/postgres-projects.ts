import { Pool } from 'pg';
import type { ColumnId, Project, ProjectTaskCounts } from '../types.js';
import type { ProjectRepository } from './project-types.js';

interface ProjectRow {
  id: string;
  name: string;
  repo_path: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface CountRow {
  column_id: ColumnId;
  count: string;
}

function emptyCounts(): ProjectTaskCounts {
  return { backlog: 0, 'in-progress': 0, review: 0, done: 0, total: 0 };
}

function rowToProject(row: ProjectRow, taskCounts?: ProjectTaskCounts): Project {
  return {
    id: row.id,
    name: row.name,
    repoPath: row.repo_path ?? undefined,
    isDefault: row.is_default,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    ...(taskCounts ? { taskCounts } : {}),
  };
}

export class PostgresProjectRepository implements ProjectRepository {
  constructor(private readonly pool: Pool) {}

  async getAllWithCounts(): Promise<Project[]> {
    const { rows } = await this.pool.query<ProjectRow>(`SELECT * FROM projects ORDER BY CASE WHEN id = 'default' THEN 0 ELSE 1 END, created_at ASC`);
    return Promise.all(rows.map(async (row) => rowToProject(row, await this.getCounts(row.id))));
  }

  async getById(id: string): Promise<Project | undefined> {
    const { rows } = await this.pool.query<ProjectRow>('SELECT * FROM projects WHERE id = $1', [id]);
    return rows[0] ? rowToProject(rows[0], await this.getCounts(rows[0].id)) : undefined;
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
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<ProjectRow>(
        `INSERT INTO projects (id, name, repo_path, is_default, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [input.id, input.name, input.repoPath ?? null, false, input.createdAt, input.updatedAt],
      );
      await client.query('COMMIT');
      return rowToProject(rows[0], await this.getCounts(input.id));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async update(id: string, updates: {
    name?: string;
    repoPath?: string | null;
    updatedAt: number;
  }): Promise<Project | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<ProjectRow>('SELECT * FROM projects WHERE id = $1 FOR UPDATE', [id]);
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return undefined;
      }
      const existing = rows[0];
      const { rows: updatedRows } = await client.query<ProjectRow>(
        `UPDATE projects
         SET name = $1, repo_path = $2, is_default = $3, updated_at = $4
         WHERE id = $5
         RETURNING *`,
        [
          updates.name ?? existing.name,
          updates.repoPath === undefined ? existing.repo_path : updates.repoPath,
          existing.is_default,
          updates.updatedAt,
          id,
        ],
      );
      await client.query('COMMIT');
      return rowToProject(updatedRows[0], await this.getCounts(id));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async hasTasksOrGroups(id: string): Promise<boolean> {
    const [{ count: taskCount }] = (await this.pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM tasks WHERE project_id = $1', [id])).rows;
    if (Number(taskCount) > 0) return true;
    const [{ count: groupCount }] = (await this.pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM task_groups WHERE project_id = $1', [id])).rows;
    return Number(groupCount) > 0;
  }

  async delete(id: string): Promise<boolean> {
    if (id === 'default') return false;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<ProjectRow>('SELECT * FROM projects WHERE id = $1 FOR UPDATE', [id]);
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return false;
      }
      const [{ count: taskCount }] = (await client.query<{ count: string }>('SELECT COUNT(*) AS count FROM tasks WHERE project_id = $1', [id])).rows;
      const [{ count: groupCount }] = (await client.query<{ count: string }>('SELECT COUNT(*) AS count FROM task_groups WHERE project_id = $1', [id])).rows;
      if (Number(taskCount) > 0 || Number(groupCount) > 0) {
        await client.query('ROLLBACK');
        return false;
      }
      const result = await client.query('DELETE FROM projects WHERE id = $1', [id]);
      if (rows[0].is_default) {
        await client.query('UPDATE projects SET is_default = TRUE WHERE id = $1', ['default']);
      }
      await client.query('COMMIT');
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async getCounts(projectId: string): Promise<ProjectTaskCounts> {
    const counts = emptyCounts();
    const taskRows = (await this.pool.query<CountRow>(
      `SELECT column_id, COUNT(*) AS count
       FROM tasks
       WHERE project_id = $1 AND archived = FALSE AND group_id IS NULL
       GROUP BY column_id`,
      [projectId],
    )).rows;
    const groupRows = (await this.pool.query<CountRow>(
      `SELECT column_id, COUNT(*) AS count
       FROM task_groups
       WHERE project_id = $1 AND archived = FALSE
       GROUP BY column_id`,
      [projectId],
    )).rows;
    for (const row of [...taskRows, ...groupRows]) {
      const count = Number(row.count);
      counts[row.column_id] += count;
      counts.total += count;
    }
    return counts;
  }
}
