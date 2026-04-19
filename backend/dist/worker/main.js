"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("../config/env");
const postgres_1 = require("../platform/db/postgres");
const correlation_1 = require("../platform/diagnostics/correlation");
const structuredLogger_1 = require("../platform/diagnostics/structuredLogger");
const objectStorage_1 = require("../platform/storage/objectStorage");
const serviceRuntime_1 = require("../runtime/serviceRuntime");
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
    const runtime = (0, serviceRuntime_1.createServiceRuntime)({
        serviceName: 'worker-service',
        serviceRole: 'worker',
        host: environment.host,
        port: environment.port,
        verifyDatabaseReadiness: () => (0, postgres_1.verifyPostgresConnectivity)(pool),
        logger,
    });
    const { port } = await runtime.start();
    logger.info('worker.boot.completed', {
        port,
        readiness: runtime.snapshot(),
    });
    registerShutdown(async () => {
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
