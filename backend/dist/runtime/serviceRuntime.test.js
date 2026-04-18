"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const serviceRuntime_1 = require("./serviceRuntime");
const runtimes = [];
(0, vitest_1.afterEach)(async () => {
    while (runtimes.length > 0) {
        const runtime = runtimes.pop();
        if (runtime) {
            await runtime.stop();
        }
    }
});
(0, vitest_1.describe)('createServiceRuntime', () => {
    (0, vitest_1.it)('boots API and worker runtimes independently with readiness endpoints', async () => {
        const api = (0, serviceRuntime_1.createServiceRuntime)({
            serviceName: 'api-service',
            serviceRole: 'api',
            host: '127.0.0.1',
            port: 0,
            verifyDatabaseReadiness: async () => undefined,
        });
        const worker = (0, serviceRuntime_1.createServiceRuntime)({
            serviceName: 'worker-service',
            serviceRole: 'worker',
            host: '127.0.0.1',
            port: 0,
            verifyDatabaseReadiness: async () => undefined,
        });
        runtimes.push(api, worker);
        const apiBinding = await api.start();
        const workerBinding = await worker.start();
        const apiReady = await fetch(`http://127.0.0.1:${apiBinding.port}/health/ready`);
        const workerReady = await fetch(`http://127.0.0.1:${workerBinding.port}/health/ready`);
        (0, vitest_1.expect)(apiReady.status).toBe(200);
        (0, vitest_1.expect)(workerReady.status).toBe(200);
        (0, vitest_1.expect)((await apiReady.json()).serviceName).toBe('api-service');
        (0, vitest_1.expect)((await workerReady.json()).serviceName).toBe('worker-service');
    });
    (0, vitest_1.it)('reports readiness failure when database verification fails', async () => {
        const api = (0, serviceRuntime_1.createServiceRuntime)({
            serviceName: 'api-service',
            serviceRole: 'api',
            host: '127.0.0.1',
            port: 0,
            verifyDatabaseReadiness: async () => {
                throw new Error('database unavailable');
            },
        });
        runtimes.push(api);
        const binding = await api.start();
        const ready = await fetch(`http://127.0.0.1:${binding.port}/health/ready`);
        const body = (await ready.json());
        (0, vitest_1.expect)(ready.status).toBe(503);
        (0, vitest_1.expect)(body.ready).toBe(false);
        (0, vitest_1.expect)(body.lastError).toContain('database unavailable');
    });
});
