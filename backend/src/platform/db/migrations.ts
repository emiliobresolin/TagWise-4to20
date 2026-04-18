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
