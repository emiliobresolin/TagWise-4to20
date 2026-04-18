import { loadServiceEnvironment } from '../../config/env';
import { createPostgresPool } from './postgres';
import { runPostgresMigrations } from './migrations';

async function main() {
  const environment = loadServiceEnvironment('api');
  const pool = createPostgresPool(environment);

  try {
    const summary = await runPostgresMigrations(pool);
    console.log(
      JSON.stringify(
        {
          level: 'info',
          event: 'db.migrations.completed',
          appliedMigrationIds: summary.appliedMigrationIds,
          currentSchemaVersion: summary.currentSchemaVersion,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown migration error';
  console.error(JSON.stringify({ level: 'error', event: 'db.migrations.failed', message }, null, 2));
  process.exitCode = 1;
});
