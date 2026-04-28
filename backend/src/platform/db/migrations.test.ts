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
    const managerRouteRows = (await pool.query(
      `SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'manager_review_routes';`,
    )) as { rows: Array<{ count: string }> };

    expect(summary.appliedMigrationIds).toEqual([
      '0001_service_foundation',
      '0002_auth_users',
      '0003_audit_events',
      '0004_assigned_work_packages',
      '0005_evidence_sync_records',
      '0006_report_submission_records',
      '0007_supervisor_review_routes',
      '0008_supervisor_standard_decision_states',
      '0009_supervisor_escalation_manager_routes',
    ]);
    expect(summary.currentSchemaVersion).toBe(9);
    expect(Number(rows.rows[0]?.count ?? 0)).toBe(1);
    expect(Number(managerRouteRows.rows[0]?.count ?? 0)).toBe(1);

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
    expect(Number(rows.rows[0]?.count ?? 0)).toBe(9);

    await pool.end();
  });
});
