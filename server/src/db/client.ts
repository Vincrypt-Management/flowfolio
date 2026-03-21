// server/src/db/client.ts
// Re-exports the shared pg Pool and a typed query helper.
// The pool is configured from the DATABASE_URL environment variable.
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/** Thin typed wrapper around pool.query for convenience. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, values);
}
