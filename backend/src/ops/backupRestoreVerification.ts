import type { QueryableDatabase } from '../platform/db/postgres';
import { postgresMigrationDefinitions } from '../platform/db/migrations';

export interface BackupRestoreVerificationSnapshot {
  schemaVersion: number;
  migrationIds: string[];
  tableRowCounts: Record<string, number>;
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
  const expectedMigrationIds = postgresMigrationDefinitions.map((migration) => migration.id);
  const expectedSchemaVersion = expectedMigrationIds.length;
  const source = await readSchemaSnapshot(sourceDatabase);
  const restored = await readSchemaSnapshot(restoredDatabase);

  assertMigrationIdentity('Source database', source.migrationIds, expectedMigrationIds);
  assertMigrationIdentity('Restored database', restored.migrationIds, expectedMigrationIds);
  assertRestoredTableCountsMatchSource(source.tableRowCounts, restored.tableRowCounts);

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
    tableRowCounts: await readCoreTableRowCounts(database),
  };
}

const coreRestoreVerificationTables = [
  'service_bootstrap_checks',
  'auth_users',
  'audit_events',
  'assigned_work_packages',
  'assigned_work_package_snapshots',
  'evidence_sync_records',
  'report_submission_records',
  'supervisor_review_routes',
  'manager_review_routes',
  'mobile_runtime_error_events',
  'worker_jobs',
  'worker_job_drill_events',
] as const;

async function readCoreTableRowCounts(
  database: QueryableDatabase,
): Promise<Record<string, number>> {
  const tableRowCounts: Record<string, number> = {};

  for (const tableName of coreRestoreVerificationTables) {
    const result = await database.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)};`,
    );
    tableRowCounts[tableName] = Number(result.rows[0]?.count ?? 0);
  }

  return tableRowCounts;
}

function assertMigrationIdentity(
  label: string,
  actualMigrationIds: string[],
  expectedMigrationIds: string[],
): void {
  if (actualMigrationIds.length !== expectedMigrationIds.length) {
    throw new Error(
      `${label} schema version ${actualMigrationIds.length} does not match expected ${expectedMigrationIds.length}.`,
    );
  }

  const mismatchIndex = expectedMigrationIds.findIndex(
    (expectedId, index) => actualMigrationIds[index] !== expectedId,
  );

  if (mismatchIndex >= 0) {
    throw new Error(
      `${label} migration identity does not match expected migrations at position ${mismatchIndex + 1}.`,
    );
  }
}

function assertRestoredTableCountsMatchSource(
  sourceTableRowCounts: Record<string, number>,
  restoredTableRowCounts: Record<string, number>,
): void {
  for (const tableName of coreRestoreVerificationTables) {
    const sourceCount = sourceTableRowCounts[tableName] ?? 0;
    const restoredCount = restoredTableRowCounts[tableName] ?? 0;

    if (restoredCount !== sourceCount) {
      throw new Error(
        `Restored database table ${tableName} row count ${restoredCount} does not match source ${sourceCount}.`,
      );
    }
  }
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}
