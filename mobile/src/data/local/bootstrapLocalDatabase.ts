import type { AppBootstrapSnapshot } from '../../features/app-shell/model';
import { createAppSandboxBoundary, type AppSandboxBoundary } from '../../platform/files/appSandboxBoundary';
import { AuthSessionCacheRepository } from './repositories/authSessionCacheRepository';
import { AppPreferencesRepository } from './repositories/appPreferencesRepository';
import { BootstrapDemoRepository } from './repositories/bootstrapDemoRepository';
import { LocalWorkStateRepository } from './repositories/localWorkStateRepository';
import { MobileRuntimeErrorRepository } from './repositories/mobileRuntimeErrorRepository';
import { UserPartitionedLocalStoreFactory } from './repositories/userPartitionedLocalStoreFactory';
import { runMigrations } from './sqlite/migrations';
import type { LocalDatabase } from './sqlite/types';

export const LOCAL_DATABASE_NAME = 'tagwise.db';

export interface LocalRuntime {
  database: LocalDatabase;
  snapshot: AppBootstrapSnapshot;
  repositories: {
    appPreferences: AppPreferencesRepository;
    bootstrapDemo: BootstrapDemoRepository;
    authSessionCache: AuthSessionCacheRepository;
    localWorkState: LocalWorkStateRepository;
    mobileRuntimeErrors: MobileRuntimeErrorRepository;
    userPartitions: UserPartitionedLocalStoreFactory;
  };
}

export async function bootstrapLocalDatabase(
  openDatabase: () => Promise<LocalDatabase> = openDefaultLocalDatabase,
  openSandboxBoundary: () => Promise<AppSandboxBoundary> = openDefaultAppSandboxBoundary,
): Promise<LocalRuntime> {
  const database = await openDatabase();
  const sandboxBoundary = await openSandboxBoundary();
  const migrationSummary = await runMigrations(database);

  const appPreferences = new AppPreferencesRepository(database);
  const bootstrapDemo = new BootstrapDemoRepository(database);
  const authSessionCache = new AuthSessionCacheRepository(database);
  const localWorkState = new LocalWorkStateRepository(database);
  const mobileRuntimeErrors = new MobileRuntimeErrorRepository(database);
  const userPartitions = new UserPartitionedLocalStoreFactory(database, sandboxBoundary);

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
      authSessionCache,
      localWorkState,
      mobileRuntimeErrors,
      userPartitions,
    },
  };
}

async function openDefaultLocalDatabase(): Promise<LocalDatabase> {
  const { openExpoDatabaseAsync } = await import('./sqlite/expoSqliteDatabase');
  return openExpoDatabaseAsync(LOCAL_DATABASE_NAME);
}

async function openDefaultAppSandboxBoundary(): Promise<AppSandboxBoundary> {
  return createAppSandboxBoundary();
}
