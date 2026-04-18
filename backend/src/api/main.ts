import { loadServiceEnvironment } from '../config/env';
import { createPostgresPool, verifyPostgresConnectivity } from '../platform/db/postgres';
import { createServiceRuntime } from '../runtime/serviceRuntime';

async function main() {
  const environment = loadServiceEnvironment('api');
  const pool = createPostgresPool(environment);
  const runtime = createServiceRuntime({
    serviceName: 'api-service',
    serviceRole: 'api',
    host: environment.host,
    port: environment.port,
    verifyDatabaseReadiness: () => verifyPostgresConnectivity(pool),
  });

  const { port } = await runtime.start();
  console.log(
    JSON.stringify(
      {
        level: 'info',
        event: 'api.boot.completed',
        serviceName: 'api-service',
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
  const message = error instanceof Error ? error.message : 'Unknown API bootstrap error';
  console.error(JSON.stringify({ level: 'error', event: 'api.boot.failed', message }, null, 2));
  process.exitCode = 1;
});
