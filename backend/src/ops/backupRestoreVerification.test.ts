import { describe, expect, it } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';

import { postgresMigrationDefinitions } from '../platform/db/migrations';
import type { QueryableDatabase } from '../platform/db/postgres';
import { verifyBackupRestoreBaseline } from './backupRestoreVerification';

describe('verifyBackupRestoreBaseline', () => {
  it('passes when restored schema matches source and current migrations', async () => {
    const database = buildSchemaDatabase(postgresMigrationDefinitions.map((migration) => migration.id));

    await expect(verifyBackupRestoreBaseline(database, database)).resolves.toMatchObject({
      expectedSchemaVersion: postgresMigrationDefinitions.length,
      source: {
        schemaVersion: postgresMigrationDefinitions.length,
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
});

function buildSchemaDatabase(migrationIds: string[]): QueryableDatabase {
  return {
    async query<Result extends QueryResultRow = QueryResultRow>() {
      return {
        command: 'SELECT',
        rowCount: migrationIds.length,
        oid: 0,
        fields: [],
        rows: migrationIds.map((id) => ({ id })) as unknown as Result[],
      } satisfies QueryResult<Result>;
    },
  };
}
