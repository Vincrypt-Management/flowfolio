import { assert, assertEquals } from "jsr:@std/assert";
import { closeDatabase, openDatabase } from "./connection.ts";

Deno.test("opening a database creates all migrated tables", () => {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db = openDatabase(path);

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => (row as { name: string }).name);

  for (
    const expected of [
      "symbols",
      "prices_daily",
      "fundamentals_overview",
      "vibe_plans",
      "journal_events",
      "refresh_jobs",
      "sentiment_cache",
      "analyst_cache",
      "quant_metrics_cache",
      "price_cache",
    ]
  ) {
    assert(tables.includes(expected), `expected table ${expected} to exist`);
  }

  closeDatabase(db);
});

Deno.test("reopening the same database file does not re-run migrations twice", () => {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db1 = openDatabase(path);
  closeDatabase(db1);

  const db2 = openDatabase(path);
  const migrationCount = db2
    .prepare("SELECT COUNT(*) as count FROM _migrations")
    .get() as { count: number };
  assertEquals(migrationCount.count, 2);
  closeDatabase(db2);
});
