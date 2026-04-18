import type { AppBootstrapSnapshot } from '../../features/app-shell/model';
import { AppPreferencesRepository } from './repositories/appPreferencesRepository';
import { BootstrapDemoRepository } from './repositories/bootstrapDemoRepository';
import { runMigrations } from './sqlite/migrations';
import type { LocalDatabase } from './sqlite/types';

export const LOCAL_DATABASE_NAME = 'tagwise.db';

export interface LocalRuntime {
  database: LocalDatabase;
  snapshot: AppBootstrapSnapshot;
  repositories: {
    appPreferences: AppPreferencesRepository;
    bootstrapDemo: BootstrapDemoRepository;
  };
}

export async function bootstrapLocalDatabase(
  openDatabase: () => Promise<LocalDatabase> = openDefaultLocalDatabase,
): Promise<LocalRuntime> {
  const database = await openDatabase();
  const migrationSummary = await runMigrations(database);

  const appPreferences = new AppPreferencesRepository(database);
  const bootstrapDemo = new BootstrapDemoRepository(database);

  const demoRecord = await bootstrapDemo.recordLaunch();
  const shellRoute = await appPreferences.getShellRoute();

  return {
    database,
    snapshot: {
      shellRoute,
      demoRecord,
      migrationSummary,
      databaseName: LOCAL_DATABASE_NAME,
    },
    repositories: {
      appPreferences,
      bootstrapDemo,
    },
  };
}

async function openDefaultLocalDatabase(): Promise<LocalDatabase> {
  const { openExpoDatabaseAsync } = await import('./sqlite/expoSqliteDatabase');
  return openExpoDatabaseAsync(LOCAL_DATABASE_NAME);
}
