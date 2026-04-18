import { loadServiceEnvironment } from '../config/env';
import { createPostgresPool, verifyPostgresConnectivity } from '../platform/db/postgres';
import { createS3ObjectStorageClient } from '../platform/storage/objectStorage';
import { createServiceRuntime } from '../runtime/serviceRuntime';

async function main() {
  const environment = loadServiceEnvironment('worker');
  const pool = createPostgresPool(environment);

  // Story 1.2 wires object storage into the worker boundary without starting later media flows yet.
  createS3ObjectStorageClient(environment.objectStorage);

  const runtime = createServiceRuntime({
    serviceName: 'worker-service',
    serviceRole: 'worker',
    host: environment.host,
    port: environment.port,
    verifyDatabaseReadiness: () => verifyPostgresConnectivity(pool),
  });

  const { port } = await runtime.start();
  console.log(
    JSON.stringify(
      {
        level: 'info',
        event: 'worker.boot.completed',
        serviceName: 'worker-service',
        port,
        readiness: runtime.snapshot(),
      },
      null,
      2,
    ),
  );

  registerShutdown(async () => {
    await runtime.stop();
    await pool.end();
  });
}

function registerShutdown(shutdown: () => Promise<void>) {
  let shuttingDown = false;

  const handler = async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    await shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => void handler());
  process.on('SIGTERM', () => void handler());
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown worker bootstrap error';
  console.error(JSON.stringify({ level: 'error', event: 'worker.boot.failed', message }, null, 2));
  process.exitCode = 1;
});
