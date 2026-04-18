export type SqlParam = string | number | null;
export type SqlParams = SqlParam[];

export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number | null;
}

export interface LocalDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlParams): Promise<SqlRunResult>;
  getFirstAsync<T>(sql: string, params?: SqlParams): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: SqlParams): Promise<T[]>;
  closeAsync?(): Promise<void>;
}
