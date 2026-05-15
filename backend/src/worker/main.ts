import { loadServiceEnvironment } from '../config/env';
import { createPostgresPool, verifyPostgresConnectivity } from '../platform/db/postgres';
import { generateCorrelationId } from '../platform/diagnostics/correlation';
import { createStructuredLogger } from '../platform/diagnostics/structuredLogger';
import { createS3ObjectStorageClient } from '../platform/storage/objectStorage';
import { createServiceRuntime } from '../runtime/serviceRuntime';
import { WorkerJobRepository } from '../modules/worker-jobs/workerJobRepository';
import { WorkerJobService } from '../modules/worker-jobs/workerJobService';
import { AiDiagnosisRepository } from '../modules/ai-diagnosis/aiDiagnosisRepository';
import { createAiDiagnosisProvider } from '../modules/ai-diagnosis/aiDiagnosisProviderFactory';
import { createAiDiagnosisJobHandler } from '../modules/ai-diagnosis/aiDiagnosisJobHandler';
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

  // Story 8.9 D-01: register the AI diagnosis worker handler. Provider
  // selection comes from `environment.ai` (mock by default; OpenAI when
  // configured). The handler is best-effort: provider failures move the
  // per-report AI row to 'failed-nonblocking' but never halt the report.
  const aiDiagnosisRepository = new AiDiagnosisRepository(pool);
  const aiDiagnosisProvider = createAiDiagnosisProvider(environment.ai);
  const aiDiagnosisJobHandler = createAiDiagnosisJobHandler({
    repository: aiDiagnosisRepository,
    provider: aiDiagnosisProvider,
  });

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
      aiDiagnosisJobHandler,
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
