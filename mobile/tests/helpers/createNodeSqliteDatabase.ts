import { DatabaseSync } from 'node:sqlite';

import type { LocalDatabase, SqlParams, SqlRunResult } from '../../src/data/local/sqlite/types';

export function createNodeSqliteDatabase(path: string): LocalDatabase {
  const database = new DatabaseSync(path);

  database.exec('PRAGMA journal_mode = WAL;');
  database.exec('PRAGMA foreign_keys = ON;');

  return {
    async execAsync(sql: string): Promise<void> {
      database.exec(sql);
    },

    async runAsync(sql: string, params: SqlParams = []): Promise<SqlRunResult> {
      const result = database.prepare(sql).run(...params);
      const changes =
        typeof result.changes === 'bigint' ? Number(result.changes) : result.changes;
      const lastInsertRowId =
        typeof result.lastInsertRowid === 'bigint'
          ? Number(result.lastInsertRowid)
          : result.lastInsertRowid ?? null;

      return {
        changes,
        lastInsertRowId: typeof lastInsertRowId === 'number' ? lastInsertRowId : null,
      };
    },

    async getFirstAsync<T>(sql: string, params: SqlParams = []): Promise<T | null> {
      const record = database.prepare(sql).get(...params) as T | undefined;
      return record ?? null;
    },

    async getAllAsync<T>(sql: string, params: SqlParams = []): Promise<T[]> {
      return database.prepare(sql).all(...params) as T[];
    },

    async closeAsync(): Promise<void> {
      database.close();
    },
  };
}
