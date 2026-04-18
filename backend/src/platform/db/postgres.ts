import { Pool, type QueryResult, type QueryResultRow } from 'pg';

import type { ServiceEnvironment } from '../../config/env';

export interface QueryableDatabase {
  query<Result extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<Result>>;
}

export function createPostgresPool(environment: ServiceEnvironment): Pool {
  return new Pool({
    connectionString: environment.databaseUrl,
    application_name: `tagwise-${environment.serviceRole}`,
    max: environment.serviceRole === 'worker' ? 5 : 10,
  });
}

export async function verifyPostgresConnectivity(database: QueryableDatabase): Promise<void> {
  await database.query('SELECT 1;');
}
