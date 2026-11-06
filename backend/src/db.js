import { readdir, readFile } from 'node:fs/promises';
import postgres from 'postgres';

// Connection settings come from the standard PGHOST, PGUSER, PGPASSWORD and PGDATABASE variables.
export const sql = postgres({ max: 10, onnotice: () => {} });

const MIGRATIONS = new URL('../migrations/', import.meta.url);

// Each file runs once, in name order. The advisory lock keeps concurrent starts from racing.
export async function migrate() {
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(727274)`;
    await tx`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    const applied = new Set((await tx`SELECT name FROM schema_migrations`).map(r => r.name));
    const files = (await readdir(MIGRATIONS)).filter(f => f.endsWith('.sql')).sort();
    for (const name of files) {
      if (applied.has(name)) continue;
      await tx.unsafe(await readFile(new URL(name, MIGRATIONS), 'utf8'));
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
      console.log(`Applied migration ${name}`);
    }
  });
}
