"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServiceRuntime = createServiceRuntime;
const httpHealthServer_1 = require("../platform/health/httpHealthServer");
const readiness_1 = require("../platform/health/readiness");
function createServiceRuntime(options) {
    const readiness = new readiness_1.ReadinessState(options.serviceName, options.serviceRole, ['database']);
    const healthServer = (0, httpHealthServer_1.createHttpHealthServer)({
        serviceName: options.serviceName,
        host: options.host,
        port: options.port,
        getReadinessSnapshot: () => readiness.snapshot(),
    });
    return {
        async start() {
            const server = await healthServer.start();
            await bootstrapReadiness(readiness, options.verifyDatabaseReadiness);
            return server;
        },
        async stop() {
            await healthServer.stop();
        },
        snapshot() {
            return readiness.snapshot();
        },
    };
}
async function bootstrapReadiness(readiness, verifyDatabaseReadiness) {
    try {
        await verifyDatabaseReadiness();
        readiness.markCheckReady('database');
    }
    catch (error) {
        readiness.markCheckFailed('database', error instanceof Error ? error.message : 'Unknown database readiness error');
    }
}
