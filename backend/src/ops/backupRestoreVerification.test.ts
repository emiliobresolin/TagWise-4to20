import { describe, expect, it } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';

import { postgresMigrationDefinitions } from '../platform/db/migrations';
import type { QueryableDatabase } from '../platform/db/postgres';
import { verifyBackupRestoreBaseline } from './backupRestoreVerification';

describe('verifyBackupRestoreBaseline', () => {
  it('passes when restored schema matches source and current migrations', async () => {
    const database = buildSchemaDatabase(
      postgresMigrationDefinitions.map((migration) => migration.id),
      {
        auth_users: 3,
        assigned_work_packages: 2,
        report_submission_records: 4,
      },
    );

    await expect(verifyBackupRestoreBaseline(database, database)).resolves.toMatchObject({
      expectedSchemaVersion: postgresMigrationDefinitions.length,
      source: {
        schemaVersion: postgresMigrationDefinitions.length,
        tableRowCounts: {
          auth_users: 3,
          assigned_work_packages: 2,
          report_submission_records: 4,
        },
      },
      restored: {
        schemaVersion: postgresMigrationDefinitions.length,
      },
    });
  });

  it('fails when restored schema lags behind the source database', async () => {
    const source = buildSchemaDatabase(postgresMigrationDefinitions.map((migration) => migration.id));
    const restored = buildSchemaDatabase(
      postgresMigrationDefinitions.slice(0, -1).map((migration) => migration.id),
    );

    await expect(verifyBackupRestoreBaseline(source, restored)).rejects.toThrow(
      'Restored database schema version',
    );
  });

  it('fails when restored migration counts match but migration IDs differ', async () => {
    const migrationIds = postgresMigrationDefinitions.map((migration) => migration.id);
    const wrongMigrationIds = [
      ...migrationIds.slice(0, -1),
      '9999_unexpected_migration',
    ];
    const source = buildSchemaDatabase(migrationIds);
    const restored = buildSchemaDatabase(wrongMigrationIds);

    await expect(verifyBackupRestoreBaseline(source, restored)).rejects.toThrow(
      'Restored database migration identity',
    );
  });

  it('fails when restored core table row counts do not match the source database', async () => {
    const migrationIds = postgresMigrationDefinitions.map((migration) => migration.id);
    const source = buildSchemaDatabase(migrationIds, {
      auth_users: 3,
      report_submission_records: 2,
    });
    const restored = buildSchemaDatabase(migrationIds, {
      auth_users: 3,
      report_submission_records: 1,
    });

    await expect(verifyBackupRestoreBaseline(source, restored)).rejects.toThrow(
      'report_submission_records row count',
    );
  });
});

function buildSchemaDatabase(
  migrationIds: string[],
  tableRowCounts: Record<string, number> = {},
): QueryableDatabase {
  return {
    async query<Result extends QueryResultRow = QueryResultRow>(text: string) {
      if (text.includes('schema_migrations')) {
        return {
          command: 'SELECT',
          rowCount: migrationIds.length,
          oid: 0,
          fields: [],
          rows: migrationIds.map((id) => ({ id })) as unknown as Result[],
        } satisfies QueryResult<Result>;
      }

      const tableName = text.match(/FROM "([^"]+)"/)?.[1];
      if (tableName) {
        const count = tableRowCounts[tableName] ?? 0;
        return {
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
          rows: [{ count: String(count) }] as unknown as Result[],
        } satisfies QueryResult<Result>;
      }

      throw new Error(`Unexpected query in test database: ${text}`);
    },
  };
}
