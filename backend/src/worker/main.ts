import { loadServiceEnvironment } from '../config/env';
import { createPostgresPool, verifyPostgresConnectivity } from '../platform/db/postgres';
import { generateCorrelationId } from '../platform/diagnostics/correlation';
import { createStructuredLogger } from '../platform/diagnostics/structuredLogger';
import { createS3ObjectStorageClient } from '../platform/storage/objectStorage';
import { createServiceRuntime } from '../runtime/serviceRuntime';
import { WorkerJobRepository } from '../modules/worker-jobs/workerJobRepository';
import { WorkerJobService } from '../modules/worker-jobs/workerJobService';
import { startWorkerJobLoop } from './workerJobLoop';

async function main() {
  const environment = loadServiceEnvironment('worker');
  const pool = createPostgresPool(environment);
  const logger = createStructuredLogger({
    serviceName: 'worker-service',
    serviceRole: 'worker',
    correlationId: generateCorrelationId(),
  });

  // Story 1.2 wires object storage into the worker boundary without starting later media flows yet.
  createS3ObjectStorageClient(environment.objectStorage);
  const workerJobRepository = new WorkerJobRepository(pool);
  const workerJobService = new WorkerJobService(workerJobRepository, {
    workerId: `worker-service:${process.pid}`,
    handlers: [
      {
        jobType: 'ops.restart-drill',
        handle: async (job) => {
          await workerJobRepository.recordDrillSideEffect({
            jobId: job.id,
            idempotencyKey: job.idempotencyKey,
            processedAt: new Date().toISOString(),
          });
        },
      },
    ],
  });

  const runtime = createServiceRuntime({
    serviceName: 'worker-service',
    serviceRole: 'worker',
    host: environment.host,
    port: environment.port,
    verifyDatabaseReadiness: () => verifyPostgresConnectivity(pool),
    logger,
  });

  const { port } = await runtime.start();
  const workerJobLoop = startWorkerJobLoop({
    service: workerJobService,
    logger,
  });
  logger.info('worker.boot.completed', {
    port,
    readiness: runtime.snapshot(),
  });

  registerShutdown(async () => {
    workerJobLoop.stop();
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
  createStructuredLogger({
    serviceName: 'worker-service',
    serviceRole: 'worker',
    correlationId: generateCorrelationId(),
  }).error('worker.boot.failed', error);
  process.exitCode = 1;
});
