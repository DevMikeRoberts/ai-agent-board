import Database from 'better-sqlite3';
import type { TaskAttachment } from '../types.js';
import type { AttachmentStore } from '../routes/attachments.js';

interface AttachmentRow {
  id: string;
  task_id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: number;
}

function rowToAttachment(row: AttachmentRow): TaskAttachment {
  return {
    id: row.id,
    taskId: row.task_id,
    filename: row.filename,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size,
    createdAt: row.created_at,
  };
}

export class SqliteAttachmentStore implements AttachmentStore {
  constructor(private db: Database.Database) {}

  async insert(a: TaskAttachment): Promise<void> {
    this.db.prepare(`
      INSERT INTO task_attachments (id, task_id, filename, original_name, mime_type, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(a.id, a.taskId, a.filename, a.originalName, a.mimeType, a.size, a.createdAt);
  }

  async getByTaskId(taskId: string): Promise<TaskAttachment[]> {
    const rows = this.db.prepare(
      `SELECT * FROM task_attachments WHERE task_id = ? ORDER BY created_at ASC`
    ).all(taskId) as AttachmentRow[];
    return rows.map(rowToAttachment);
  }

  async getById(id: string): Promise<TaskAttachment | undefined> {
    const row = this.db.prepare(`SELECT * FROM task_attachments WHERE id = ?`).get(id) as AttachmentRow | undefined;
    return row ? rowToAttachment(row) : undefined;
  }

  async deleteById(id: string): Promise<boolean> {
    const result = this.db.prepare(`DELETE FROM task_attachments WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  async countByTaskId(taskId: string): Promise<number> {
    const row = this.db.prepare(`SELECT COUNT(*) as cnt FROM task_attachments WHERE task_id = ?`).get(taskId) as { cnt: number };
    return row.cnt;
  }
}
