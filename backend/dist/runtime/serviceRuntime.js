"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServiceRuntime = createServiceRuntime;
const serviceMetrics_1 = require("../platform/diagnostics/serviceMetrics");
const structuredLogger_1 = require("../platform/diagnostics/structuredLogger");
const httpHealthServer_1 = require("../platform/health/httpHealthServer");
const readiness_1 = require("../platform/health/readiness");
function createServiceRuntime(options) {
    const metrics = new serviceMetrics_1.ServiceMetricsState();
    const logger = options.logger ??
        (0, structuredLogger_1.createStructuredLogger)({
            serviceName: options.serviceName,
            serviceRole: options.serviceRole,
        });
    const readiness = new readiness_1.ReadinessState(options.serviceName, options.serviceRole, ['database'], metrics.snapshot());
    const healthServer = (0, httpHealthServer_1.createHttpHealthServer)({
        serviceName: options.serviceName,
        host: options.host,
        port: options.port,
        getReadinessSnapshot: () => {
            readiness.updateMetrics(metrics.snapshot());
            return readiness.snapshot();
        },
        getMetricsSnapshot: () => metrics.snapshot(),
        logger,
        metrics,
        handleRequest: options.handleRequest,
    });
    return {
        logger,
        async start() {
            const server = await healthServer.start();
            await bootstrapReadiness(readiness, options.verifyDatabaseReadiness);
            readiness.updateMetrics(metrics.snapshot());
            return server;
        },
        async stop() {
            await healthServer.stop();
        },
        snapshot() {
            readiness.updateMetrics(metrics.snapshot());
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
