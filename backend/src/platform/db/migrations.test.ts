import { describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';

import { runPostgresMigrations } from './migrations';

describe('runPostgresMigrations', () => {
  it('applies the baseline PostgreSQL schema cleanly', async () => {
    const database = newDb();
    const adapter = database.adapters.createPg();
    const pool = new adapter.Pool();

    const summary = await runPostgresMigrations(pool);
    const rows = (await pool.query(
      `SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_bootstrap_checks';`,
    )) as { rows: Array<{ count: string }> };

    expect(summary.appliedMigrationIds).toEqual(['0001_service_foundation']);
    expect(summary.currentSchemaVersion).toBe(1);
    expect(Number(rows.rows[0]?.count ?? 0)).toBe(1);

    await pool.end();
  });

  it('is idempotent when rerun against the same database', async () => {
    const database = newDb();
    const adapter = database.adapters.createPg();
    const pool = new adapter.Pool();

    await runPostgresMigrations(pool);
    const summary = await runPostgresMigrations(pool);
    const rows = (await pool.query(
      'SELECT COUNT(*) AS count FROM schema_migrations;',
    )) as { rows: Array<{ count: string }> };

    expect(summary.appliedMigrationIds).toEqual([]);
    expect(Number(rows.rows[0]?.count ?? 0)).toBe(1);

    await pool.end();
  });
});
