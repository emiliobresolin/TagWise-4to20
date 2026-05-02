import { loadServiceEnvironment } from '../config/env';
import { createPostgresPool } from '../platform/db/postgres';
import { runWorkerResilienceDrill } from './workerResilienceDrill';

async function main() {
  const environment = loadServiceEnvironment('worker');
  const pool = createPostgresPool(environment);

  try {
    const report = await runWorkerResilienceDrill({ database: pool });
    console.log(
      JSON.stringify(
        {
          level: report.passed ? 'info' : 'error',
          event: report.passed
            ? 'worker.resilience-drill.completed'
            : 'worker.resilience-drill.failed',
          report,
        },
        null,
        2,
      ),
    );

    if (!report.passed) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  const message =
    error instanceof Error ? error.message : 'Unknown worker resilience drill error';
  console.error(
    JSON.stringify(
      {
        level: 'error',
        event: 'worker.resilience-drill.failed',
        message,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
