import type { DatabaseMigrationSummary } from '../../../features/app-shell/model';
import type { LocalDatabase } from './types';

interface DatabaseMigration {
  id: number;
  apply: (database: LocalDatabase, now: string) => Promise<void>;
}

const FOUNDATION_RECORD_ID = 'shell-demo-record';

const migrations: DatabaseMigration[] = [
  {
    id: 1,
    apply: async (database, now) => {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS app_preferences (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS shell_demo_records (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          subtitle TEXT NOT NULL,
          launch_count INTEGER NOT NULL DEFAULT 0,
          manual_write_count INTEGER NOT NULL DEFAULT 0,
          last_opened_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      await database.runAsync(
        `
          INSERT OR IGNORE INTO shell_demo_records (
            id,
            title,
            subtitle,
            launch_count,
            manual_write_count,
            last_opened_at,
            updated_at
          )
          VALUES (?, ?, ?, 0, 0, ?, ?);
        `,
        [
          FOUNDATION_RECORD_ID,
          'Local-first foundation ready',
          'SQLite bootstrapped without a live API dependency.',
          now,
          now,
        ],
      );
    },
  },
];

export async function runMigrations(
  database: LocalDatabase,
): Promise<DatabaseMigrationSummary> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = await database.getAllAsync<{ id: number }>(
    'SELECT id FROM schema_migrations ORDER BY id ASC;',
  );
  const appliedMigrationIds = new Set(appliedRows.map((row) => row.id));
  const newlyApplied: number[] = [];

  for (const migration of migrations) {
    if (appliedMigrationIds.has(migration.id)) {
      continue;
    }

    const now = new Date().toISOString();

    await database.execAsync('BEGIN IMMEDIATE;');

    try {
      await migration.apply(database, now);
      await database.runAsync(
        'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?);',
        [migration.id, now],
      );
      await database.execAsync('COMMIT;');
      newlyApplied.push(migration.id);
    } catch (error) {
      await database.execAsync('ROLLBACK;');
      throw error;
    }
  }

  return {
    appliedMigrationIds: newlyApplied.map(String),
    currentSchemaVersion: migrations.length,
  };
}

export const localDatabaseSeeds = {
  foundationRecordId: FOUNDATION_RECORD_ID,
};
