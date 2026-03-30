import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', '..', '.ig-schedule.db');

export interface ScheduledPost {
  id: string;
  composition: string;
  seed: number;
  caption: string;
  hashtags: string;
  scheduled_at: string; // ISO 8601
  status: 'pending' | 'rendering' | 'rendered' | 'posting' | 'posted' | 'failed';
  video_path: string | null;
  error: string | null;
  created_at: string;
  posted_at: string | null;
}

export interface ContentSlot {
  dayOfWeek: number; // 0=Sun, 6=Sat
  hour: number;
  minute: number;
  composition: string;
}

export function getDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id TEXT PRIMARY KEY,
      composition TEXT NOT NULL,
      seed INTEGER NOT NULL,
      caption TEXT NOT NULL,
      hashtags TEXT NOT NULL DEFAULT '',
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      video_path TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      posted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS post_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schedule_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON scheduled_posts(status);
    CREATE INDEX IF NOT EXISTS idx_scheduled_posts_scheduled_at ON scheduled_posts(scheduled_at);
  `);
}

// --- Post CRUD ---

export function createPost(db: Database.Database, post: Omit<ScheduledPost, 'created_at' | 'posted_at' | 'error' | 'video_path' | 'status'>): ScheduledPost {
  const stmt = db.prepare(`
    INSERT INTO scheduled_posts (id, composition, seed, caption, hashtags, scheduled_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(post.id, post.composition, post.seed, post.caption, post.hashtags, post.scheduled_at);
  return getPost(db, post.id)!;
}

export function getPost(db: Database.Database, id: string): ScheduledPost | null {
  return db.prepare('SELECT * FROM scheduled_posts WHERE id = ?').get(id) as ScheduledPost | null;
}

export function getPendingPosts(db: Database.Database, before?: string): ScheduledPost[] {
  const cutoff = before || new Date().toISOString();
  return db.prepare(
    `SELECT * FROM scheduled_posts WHERE status = 'pending' AND scheduled_at <= ? ORDER BY scheduled_at ASC`
  ).all(cutoff) as ScheduledPost[];
}

export function getUpcomingPosts(db: Database.Database, limit = 20): ScheduledPost[] {
  return db.prepare(
    `SELECT * FROM scheduled_posts WHERE status IN ('pending', 'rendering', 'rendered') ORDER BY scheduled_at ASC LIMIT ?`
  ).all(limit) as ScheduledPost[];
}

export function updatePostStatus(db: Database.Database, id: string, status: ScheduledPost['status'], extra?: { video_path?: string; error?: string; posted_at?: string }) {
  let sql = 'UPDATE scheduled_posts SET status = ?';
  const params: any[] = [status];

  if (extra?.video_path) {
    sql += ', video_path = ?';
    params.push(extra.video_path);
  }
  if (extra?.error) {
    sql += ', error = ?';
    params.push(extra.error);
  }
  if (extra?.posted_at) {
    sql += ', posted_at = ?';
    params.push(extra.posted_at);
  }
  sql += ' WHERE id = ?';
  params.push(id);

  db.prepare(sql).run(...params);

  // Log to history
  db.prepare('INSERT INTO post_history (post_id, action, details) VALUES (?, ?, ?)').run(
    id,
    status,
    extra?.error || extra?.video_path || null
  );
}

export function getPostHistory(db: Database.Database, postId: string) {
  return db.prepare('SELECT * FROM post_history WHERE post_id = ? ORDER BY timestamp ASC').all(postId);
}

export function getStats(db: Database.Database) {
  const stats = db.prepare(`
    SELECT
      status,
      COUNT(*) as count
    FROM scheduled_posts
    GROUP BY status
  `).all() as { status: string; count: number }[];

  const total = stats.reduce((sum, s) => sum + s.count, 0);
  return { total, breakdown: Object.fromEntries(stats.map(s => [s.status, s.count])) };
}

// --- Config ---

export function getConfig(db: Database.Database, key: string, fallback?: string): string | undefined {
  const row = db.prepare('SELECT value FROM schedule_config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function setConfig(db: Database.Database, key: string, value: string) {
  db.prepare('INSERT OR REPLACE INTO schedule_config (key, value) VALUES (?, ?)').run(key, value);
}

export function deletePost(db: Database.Database, id: string) {
  db.prepare('DELETE FROM scheduled_posts WHERE id = ?').run(id);
  db.prepare('DELETE FROM post_history WHERE post_id = ?').run(id);
}

export function clearPending(db: Database.Database) {
  const result = db.prepare(`DELETE FROM scheduled_posts WHERE status = 'pending'`).run();
  return result.changes;
}
