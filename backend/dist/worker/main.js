"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("../config/env");
const postgres_1 = require("../platform/db/postgres");
const correlation_1 = require("../platform/diagnostics/correlation");
const structuredLogger_1 = require("../platform/diagnostics/structuredLogger");
const objectStorage_1 = require("../platform/storage/objectStorage");
const serviceRuntime_1 = require("../runtime/serviceRuntime");
const workerJobRepository_1 = require("../modules/worker-jobs/workerJobRepository");
const workerJobService_1 = require("../modules/worker-jobs/workerJobService");
const aiDiagnosisRepository_1 = require("../modules/ai-diagnosis/aiDiagnosisRepository");
const aiDiagnosisProviderFactory_1 = require("../modules/ai-diagnosis/aiDiagnosisProviderFactory");
const aiDiagnosisJobHandler_1 = require("../modules/ai-diagnosis/aiDiagnosisJobHandler");
const workerJobLoop_1 = require("./workerJobLoop");
async function main() {
    const environment = (0, env_1.loadServiceEnvironment)('worker');
    const pool = (0, postgres_1.createPostgresPool)(environment);
    const logger = (0, structuredLogger_1.createStructuredLogger)({
        serviceName: 'worker-service',
        serviceRole: 'worker',
        correlationId: (0, correlation_1.generateCorrelationId)(),
    });
    // Story 1.2 wires object storage into the worker boundary without starting later media flows yet.
    (0, objectStorage_1.createS3ObjectStorageClient)(environment.objectStorage);
    const workerJobRepository = new workerJobRepository_1.WorkerJobRepository(pool);
    // Story 8.9 D-01: register the AI diagnosis worker handler. Provider
    // selection comes from `environment.ai` (mock by default; OpenAI when
    // configured). The handler is best-effort: provider failures move the
    // per-report AI row to 'failed-nonblocking' but never halt the report.
    const aiDiagnosisRepository = new aiDiagnosisRepository_1.AiDiagnosisRepository(pool);
    const aiDiagnosisProvider = (0, aiDiagnosisProviderFactory_1.createAiDiagnosisProvider)(environment.ai);
    const aiDiagnosisJobHandler = (0, aiDiagnosisJobHandler_1.createAiDiagnosisJobHandler)({
        repository: aiDiagnosisRepository,
        provider: aiDiagnosisProvider,
    });
    const workerJobService = new workerJobService_1.WorkerJobService(workerJobRepository, {
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
    const runtime = (0, serviceRuntime_1.createServiceRuntime)({
        serviceName: 'worker-service',
        serviceRole: 'worker',
        host: environment.host,
        port: environment.port,
        verifyDatabaseReadiness: () => (0, postgres_1.verifyPostgresConnectivity)(pool),
        logger,
    });
    const { port } = await runtime.start();
    const workerJobLoop = (0, workerJobLoop_1.startWorkerJobLoop)({
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
function registerShutdown(shutdown) {
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
    (0, structuredLogger_1.createStructuredLogger)({
        serviceName: 'worker-service',
        serviceRole: 'worker',
        correlationId: (0, correlation_1.generateCorrelationId)(),
    }).error('worker.boot.failed', error);
    process.exitCode = 1;
});
