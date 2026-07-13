import { DatabaseSync } from "node:sqlite";
import { dirname, fromFileUrl, join } from "jsr:@std/path";

const MIGRATIONS_DIR = join(dirname(fromFileUrl(import.meta.url)), "migrations");

function ensureMigrationsTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function appliedMigrations(db: DatabaseSync): Set<string> {
  const rows = db.prepare("SELECT id FROM _migrations").all() as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

function runMigrations(db: DatabaseSync): void {
  ensureMigrationsTable(db);
  const applied = appliedMigrations(db);

  const files = Array.from(Deno.readDirSync(MIGRATIONS_DIR))
    .filter((entry) => entry.isFile && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = Deno.readTextFileSync(join(MIGRATIONS_DIR, file));
    db.exec(sql);
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run(file);
  }
}

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  runMigrations(db);
  return db;
}

export function closeDatabase(db: DatabaseSync): void {
  db.close();
}
