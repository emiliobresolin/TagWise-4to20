import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeSqliteDatabase } from '../../../../tests/helpers/createNodeSqliteDatabase';
import { runMigrations } from './migrations';

const createdDirectories: string[] = [];

afterEach(() => {
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();

    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe('runMigrations', () => {
  it('creates the shell tables and seed data', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-migrations-'));
    createdDirectories.push(tempDirectory);

    const database = createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'));

    const summary = await runMigrations(database);
    const record = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM shell_demo_records;',
    );
    const route = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM app_preferences;',
    );
    const sessionTables = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM sqlite_master
       WHERE type = 'table' AND name IN ('auth_session_cache', 'local_work_state');`,
    );

    expect(summary.currentSchemaVersion).toBe(2);
    expect(summary.appliedMigrationIds).toEqual(['1', '2']);
    expect(record?.count).toBe(1);
    expect(route?.count).toBe(0);
    expect(sessionTables?.count).toBe(2);

    await database.closeAsync?.();
  });

  it('is idempotent when the migration runner is invoked again', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-migrations-repeat-'));
    createdDirectories.push(tempDirectory);

    const database = createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'));

    await runMigrations(database);
    const summary = await runMigrations(database);

    const applied = await database.getAllAsync<{ id: number }>(
      'SELECT id FROM schema_migrations ORDER BY id ASC;',
    );
    const record = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM shell_demo_records;',
    );

    expect(summary.appliedMigrationIds).toEqual([]);
    expect(applied).toEqual([{ id: 1 }, { id: 2 }]);
    expect(record?.count).toBe(1);

    await database.closeAsync?.();
  });
});
