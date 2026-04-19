"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("../config/env");
const postgres_1 = require("../platform/db/postgres");
const correlation_1 = require("../platform/diagnostics/correlation");
const structuredLogger_1 = require("../platform/diagnostics/structuredLogger");
const serviceRuntime_1 = require("../runtime/serviceRuntime");
const auditEventRepository_1 = require("../modules/audit/auditEventRepository");
const auditEventService_1 = require("../modules/audit/auditEventService");
const authRepository_1 = require("../modules/auth/authRepository");
const authService_1 = require("../modules/auth/authService");
const createApiRequestHandler_1 = require("./createApiRequestHandler");
async function main() {
    const environment = (0, env_1.loadServiceEnvironment)('api');
    const pool = (0, postgres_1.createPostgresPool)(environment);
    const logger = (0, structuredLogger_1.createStructuredLogger)({
        serviceName: 'api-service',
        serviceRole: 'api',
        correlationId: (0, correlation_1.generateCorrelationId)(),
    });
    if (!environment.auth) {
        throw new Error('API auth configuration is missing.');
    }
    const authService = new authService_1.AuthService(new authRepository_1.AuthRepository(pool), environment.auth, new auditEventService_1.AuditEventService(new auditEventRepository_1.AuditEventRepository(pool)));
    await authService.ensureSeedUsers();
    const runtime = (0, serviceRuntime_1.createServiceRuntime)({
        serviceName: 'api-service',
        serviceRole: 'api',
        host: environment.host,
        port: environment.port,
        verifyDatabaseReadiness: () => (0, postgres_1.verifyPostgresConnectivity)(pool),
        logger,
        handleRequest: (0, createApiRequestHandler_1.createApiRequestHandler)({ authService }),
    });
    const { port } = await runtime.start();
    logger.info('api.boot.completed', {
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
        serviceName: 'api-service',
        serviceRole: 'api',
        correlationId: (0, correlation_1.generateCorrelationId)(),
    }).error('api.boot.failed', error);
    process.exitCode = 1;
});
