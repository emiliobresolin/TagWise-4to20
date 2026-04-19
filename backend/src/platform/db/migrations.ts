import type { QueryableDatabase } from './postgres';

export interface PostgresMigration {
  id: string;
  sql: string;
}

export interface PostgresMigrationSummary {
  appliedMigrationIds: string[];
  currentSchemaVersion: number;
}

const postgresMigrations: PostgresMigration[] = [
  {
    id: '0001_service_foundation',
    sql: `
      CREATE TABLE IF NOT EXISTS service_bootstrap_checks (
        check_name TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        details JSONB NOT NULL DEFAULT '{}'::jsonb
      );
    `,
  },
  {
    id: '0002_auth_users',
    sql: `
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('technician', 'supervisor', 'manager')),
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        session_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    id: '0003_audit_events',
    sql: `
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        action_type TEXT NOT NULL,
        target_object_type TEXT NOT NULL,
        target_object_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        prior_state TEXT,
        next_state TEXT,
        comment TEXT,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE INDEX IF NOT EXISTS idx_audit_events_target
      ON audit_events (target_object_type, target_object_id, occurred_at ASC);

      CREATE INDEX IF NOT EXISTS idx_audit_events_correlation
      ON audit_events (correlation_id);
    `,
  },
];

export async function runPostgresMigrations(
  database: QueryableDatabase,
): Promise<PostgresMigrationSummary> {
  const migrationTableExists = await database.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'schema_migrations';`,
  );

  if (Number(migrationTableExists.rows[0]?.count ?? 0) === 0) {
    await database.query(`
      CREATE TABLE schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
  }

  const appliedRows = await database.query<{ id: string }>(
    'SELECT id FROM schema_migrations ORDER BY id ASC;',
  );
  const appliedIds = new Set(appliedRows.rows.map((row) => row.id));
  const newlyApplied: string[] = [];

  for (const migration of postgresMigrations) {
    if (appliedIds.has(migration.id)) {
      continue;
    }

    await database.query('BEGIN;');

    try {
      await database.query(migration.sql);
      await database.query('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2);', [
        migration.id,
        new Date().toISOString(),
      ]);
      await database.query('COMMIT;');
      newlyApplied.push(migration.id);
    } catch (error) {
      await database.query('ROLLBACK;');
      throw error;
    }
  }

  return {
    appliedMigrationIds: newlyApplied,
    currentSchemaVersion: postgresMigrations.length,
  };
}

export const postgresMigrationDefinitions = postgresMigrations;
