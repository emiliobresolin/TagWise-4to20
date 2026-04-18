import * as SQLite from 'expo-sqlite';

import type { LocalDatabase, SqlParams, SqlRunResult } from './types';

export const DATABASE_NAME = 'tagwise.db';

class ExpoSqliteDatabase implements LocalDatabase {
  constructor(private readonly database: SQLite.SQLiteDatabase) {}

  async execAsync(sql: string): Promise<void> {
    await this.database.execAsync(sql);
  }

  async runAsync(sql: string, params: SqlParams = []): Promise<SqlRunResult> {
    const result = await this.database.runAsync(sql, params);

    return {
      changes: result.changes,
      lastInsertRowId:
        typeof result.lastInsertRowId === 'number' ? result.lastInsertRowId : null,
    };
  }

  async getFirstAsync<T>(sql: string, params: SqlParams = []): Promise<T | null> {
    const record = await this.database.getFirstAsync<T>(sql, params);
    return record ?? null;
  }

  async getAllAsync<T>(sql: string, params: SqlParams = []): Promise<T[]> {
    return this.database.getAllAsync<T>(sql, params);
  }

  async closeAsync(): Promise<void> {
    await this.database.closeAsync();
  }
}

export async function openExpoDatabaseAsync(
  databaseName: string = DATABASE_NAME,
): Promise<LocalDatabase> {
  const database = await SQLite.openDatabaseAsync(databaseName);

  await database.execAsync('PRAGMA journal_mode = WAL;');
  await database.execAsync('PRAGMA foreign_keys = ON;');

  return new ExpoSqliteDatabase(database);
}
