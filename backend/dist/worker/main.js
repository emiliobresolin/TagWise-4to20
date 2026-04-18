"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("../config/env");
const postgres_1 = require("../platform/db/postgres");
const objectStorage_1 = require("../platform/storage/objectStorage");
const serviceRuntime_1 = require("../runtime/serviceRuntime");
async function main() {
    const environment = (0, env_1.loadServiceEnvironment)('worker');
    const pool = (0, postgres_1.createPostgresPool)(environment);
    // Story 1.2 wires object storage into the worker boundary without starting later media flows yet.
    (0, objectStorage_1.createS3ObjectStorageClient)(environment.objectStorage);
    const runtime = (0, serviceRuntime_1.createServiceRuntime)({
        serviceName: 'worker-service',
        serviceRole: 'worker',
        host: environment.host,
        port: environment.port,
        verifyDatabaseReadiness: () => (0, postgres_1.verifyPostgresConnectivity)(pool),
    });
    const { port } = await runtime.start();
    console.log(JSON.stringify({
        level: 'info',
        event: 'worker.boot.completed',
        serviceName: 'worker-service',
        port,
        readiness: runtime.snapshot(),
    }, null, 2));
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
    const message = error instanceof Error ? error.message : 'Unknown worker bootstrap error';
    console.error(JSON.stringify({ level: 'error', event: 'worker.boot.failed', message }, null, 2));
    process.exitCode = 1;
});
