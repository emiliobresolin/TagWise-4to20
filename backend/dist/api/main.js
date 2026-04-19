"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("../config/env");
const postgres_1 = require("../platform/db/postgres");
const serviceRuntime_1 = require("../runtime/serviceRuntime");
const authRepository_1 = require("../modules/auth/authRepository");
const authService_1 = require("../modules/auth/authService");
const createApiRequestHandler_1 = require("./createApiRequestHandler");
async function main() {
    const environment = (0, env_1.loadServiceEnvironment)('api');
    const pool = (0, postgres_1.createPostgresPool)(environment);
    if (!environment.auth) {
        throw new Error('API auth configuration is missing.');
    }
    const authService = new authService_1.AuthService(new authRepository_1.AuthRepository(pool), environment.auth);
    await authService.ensureSeedUsers();
    const runtime = (0, serviceRuntime_1.createServiceRuntime)({
        serviceName: 'api-service',
        serviceRole: 'api',
        host: environment.host,
        port: environment.port,
        verifyDatabaseReadiness: () => (0, postgres_1.verifyPostgresConnectivity)(pool),
        handleRequest: (0, createApiRequestHandler_1.createApiRequestHandler)({ authService }),
    });
    const { port } = await runtime.start();
    console.log(JSON.stringify({
        level: 'info',
        event: 'api.boot.completed',
        serviceName: 'api-service',
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
    const message = error instanceof Error ? error.message : 'Unknown API bootstrap error';
    console.error(JSON.stringify({ level: 'error', event: 'api.boot.failed', message }, null, 2));
    process.exitCode = 1;
});
