import { loadServiceEnvironment } from '../config/env';
import { createPostgresPool } from '../platform/db/postgres';
import { verifyBackupRestoreBaseline } from './backupRestoreVerification';

async function main() {
  const environment = loadServiceEnvironment('api');
  const restoredDatabaseUrl = process.env.TAGWISE_RESTORED_DATABASE_URL?.trim();

  if (!restoredDatabaseUrl) {
    throw new Error('Missing required environment variable: TAGWISE_RESTORED_DATABASE_URL');
  }

  if (restoredDatabaseUrl === environment.databaseUrl) {
    throw new Error('TAGWISE_RESTORED_DATABASE_URL must point to a separate restored database.');
  }

  const sourcePool = createPostgresPool(environment);
  const restoredPool = createPostgresPool({
    ...environment,
    databaseUrl: restoredDatabaseUrl,
  });

  try {
    const report = await verifyBackupRestoreBaseline(sourcePool, restoredPool);
    console.log(
      JSON.stringify(
        {
          level: 'info',
          event: 'backup.restore.verification.completed',
          report,
        },
        null,
        2,
      ),
    );
  } finally {
    await sourcePool.end();
    await restoredPool.end();
  }
}

void main().catch((error) => {
  const message =
    error instanceof Error ? error.message : 'Unknown backup restore verification error';
  console.error(
    JSON.stringify(
      {
        level: 'error',
        event: 'backup.restore.verification.failed',
        message,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
