import Database from "better-sqlite3";
import * as path from "path";
import { app } from "electron";

let db: Database.Database | null = null;

export function dbFilePath(): string {
  return path.join(app.getPath("userData"), "toasty.db");
}

function getDB(): Database.Database {
  if (!db) {
    const dbPath = dbFilePath();
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subtasks TEXT NOT NULL DEFAULT '[]',
        priority TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'todo',
        startDate TEXT,
        dueDate TEXT,
        dueTime TEXT,
        category TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        links TEXT NOT NULL DEFAULT '[]',
        sortOrder INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);
    // Migration: add dueTime to existing databases
    try { db.exec("ALTER TABLE tasks ADD COLUMN dueTime TEXT"); } catch {}
  }
  return db;
}

export function listTasks() {
  const rows = getDB()
    .prepare("SELECT * FROM tasks ORDER BY sortOrder ASC, createdAt ASC")
    .all() as any[];
  return rows.map((r) => ({
    ...r,
    subtasks: JSON.parse(r.subtasks || "[]"),
    links: JSON.parse(r.links || "[]"),
  }));
}

export function saveTask(task: any) {
  const now = new Date().toISOString();
  getDB()
    .prepare(`
      INSERT INTO tasks
        (id, title, subtasks, priority, status, startDate, dueDate, dueTime, category, notes, links, sortOrder, createdAt, updatedAt)
      VALUES
        (@id, @title, @subtasks, @priority, @status, @startDate, @dueDate, @dueTime, @category, @notes, @links, @sortOrder, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        subtasks = excluded.subtasks,
        priority = excluded.priority,
        status = excluded.status,
        startDate = excluded.startDate,
        dueDate = excluded.dueDate,
        dueTime = excluded.dueTime,
        category = excluded.category,
        notes = excluded.notes,
        links = excluded.links,
        sortOrder = excluded.sortOrder,
        updatedAt = excluded.updatedAt
    `)
    .run({
      ...task,
      subtasks: JSON.stringify(task.subtasks || []),
      links: JSON.stringify(task.links || []),
      dueTime: task.dueTime ?? null,
      sortOrder: task.sortOrder ?? 0,
      createdAt: task.createdAt || now,
      updatedAt: now,
    });
}

export function deleteTask(id: string) {
  getDB().prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

export function clearDone() {
  getDB().prepare("DELETE FROM tasks WHERE status = 'done'").run();
}

/** Deletes all rows and checkpoints the WAL so nothing lingers to resurrect on reopen. */
export function clearTasks() {
  getDB().prepare("DELETE FROM tasks").run();
  getDB().pragma("wal_checkpoint(TRUNCATE)");
}

/** Closes the connection (checkpointing first) so its file handle is released for deletion. */
export function closeDB() {
  if (db) {
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
    db = null;
  }
}
