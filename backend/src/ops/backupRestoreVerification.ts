import type { QueryableDatabase } from '../platform/db/postgres';
import { postgresMigrationDefinitions } from '../platform/db/migrations';

export interface BackupRestoreVerificationSnapshot {
  schemaVersion: number;
  migrationIds: string[];
}

export interface BackupRestoreVerificationReport {
  expectedSchemaVersion: number;
  source: BackupRestoreVerificationSnapshot;
  restored: BackupRestoreVerificationSnapshot;
}

export async function verifyBackupRestoreBaseline(
  sourceDatabase: QueryableDatabase,
  restoredDatabase: QueryableDatabase,
): Promise<BackupRestoreVerificationReport> {
  const expectedSchemaVersion = postgresMigrationDefinitions.length;
  const source = await readSchemaSnapshot(sourceDatabase);
  const restored = await readSchemaSnapshot(restoredDatabase);

  if (source.schemaVersion !== expectedSchemaVersion) {
    throw new Error(
      `Source database schema version ${source.schemaVersion} does not match expected ${expectedSchemaVersion}.`,
    );
  }

  if (restored.schemaVersion !== source.schemaVersion) {
    throw new Error(
      `Restored database schema version ${restored.schemaVersion} does not match source ${source.schemaVersion}.`,
    );
  }

  return {
    expectedSchemaVersion,
    source,
    restored,
  };
}

async function readSchemaSnapshot(
  database: QueryableDatabase,
): Promise<BackupRestoreVerificationSnapshot> {
  const result = await database.query<{ id: string }>(
    'SELECT id FROM schema_migrations ORDER BY id ASC;',
  );
  const migrationIds = result.rows.map((row) => row.id);

  return {
    schemaVersion: migrationIds.length,
    migrationIds,
  };
}
