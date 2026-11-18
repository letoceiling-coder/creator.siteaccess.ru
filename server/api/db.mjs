/** Хранилище задач: встроенный SQLite Node (без зависимостей). */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function openDb(path) {
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL,
      kind TEXT NOT NULL,
      target TEXT NOT NULL,
      options TEXT NOT NULL,
      photos INTEGER NOT NULL,
      status TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL,
      results TEXT NOT NULL DEFAULT '[]',
      error TEXT,
      client TEXT NOT NULL,
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS jobs_status ON jobs (status, created_at);
    CREATE INDEX IF NOT EXISTS jobs_client ON jobs (client, created_at);
  `)

  // Журнал генерации и переделки (колонки добавляются к старой базе).
  for (const column of [
    'trace TEXT',
    'downloaded INTEGER NOT NULL DEFAULT 0',
    'redo_of TEXT',
    'redo_used INTEGER NOT NULL DEFAULT 0',
  ]) {
    try {
      db.exec(`ALTER TABLE jobs ADD COLUMN ${column}`)
    } catch {
      // колонка уже есть
    }
  }

  const q = {
    insert: db.prepare(
      `INSERT INTO jobs (id, token_hash, kind, target, options, photos, status, total, client, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`,
    ),
    get: db.prepare('SELECT * FROM jobs WHERE id = ?'),
    next: db.prepare(`SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1`),
    position: db.prepare(
      `SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued' AND created_at < ?`,
    ),
    running: db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'running'`),
    queued: db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued'`),
    activeFor: db.prepare(
      `SELECT COUNT(*) AS n FROM jobs WHERE client = ? AND status IN ('queued', 'running')`,
    ),
    dayFor: db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE client = ? AND created_at > ?`),
    start: db.prepare(`UPDATE jobs SET status = 'running', started_at = ?, done = 0 WHERE id = ?`),
    progress: db.prepare(`UPDATE jobs SET done = ?, results = ? WHERE id = ?`),
    finish: db.prepare(
      `UPDATE jobs SET status = ?, error = ?, finished_at = ?, results = ? WHERE id = ?`,
    ),
    cancel: db.prepare(
      `UPDATE jobs SET status = 'cancelled', finished_at = ? WHERE id = ? AND status = 'queued'`,
    ),
    requestCancel: db.prepare(
      `UPDATE jobs SET cancel_requested = 1 WHERE id = ? AND status = 'running'`,
    ),
    requeueRunning: db.prepare(
      `UPDATE jobs SET status = 'queued', done = 0, results = '[]' WHERE status = 'running'`,
    ),
    expired: db.prepare(
      `SELECT id FROM jobs WHERE status IN ('done', 'failed', 'cancelled') AND finished_at < ?`,
    ),
    expire: db.prepare(`UPDATE jobs SET status = 'expired', results = '[]' WHERE id = ?`),
    saveTrace: db.prepare('UPDATE jobs SET trace = ? WHERE id = ?'),
    markDownloaded: db.prepare('UPDATE jobs SET downloaded = 1 WHERE id = ?'),
    useRedo: db.prepare('UPDATE jobs SET redo_used = 1 WHERE id = ? AND redo_used = 0'),
    setRedoOf: db.prepare('UPDATE jobs SET redo_of = ? WHERE id = ?'),
    /** Задачи, чьи фото пора удалить: окно переделки закрылось. */
    inputsExpired: db.prepare(
      `SELECT id FROM jobs WHERE status = 'done' AND finished_at < ? AND finished_at > ?`,
    ),
  }

  return { db, q }
}
