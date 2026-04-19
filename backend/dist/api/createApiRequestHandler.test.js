"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const pg_mem_1 = require("pg-mem");
const createApiRequestHandler_1 = require("./createApiRequestHandler");
const authRepository_1 = require("../modules/auth/authRepository");
const authService_1 = require("../modules/auth/authService");
const serviceRuntime_1 = require("../runtime/serviceRuntime");
const migrations_1 = require("../platform/db/migrations");
const authConfig = {
    tokenSecret: 'unit-test-secret',
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 3600,
    seedUsers: {
        technician: {
            email: 'tech@tagwise.local',
            password: 'TagWise123!',
            displayName: 'Field Technician',
            role: 'technician',
        },
        supervisor: {
            email: 'supervisor@tagwise.local',
            password: 'TagWise123!',
            displayName: 'Field Supervisor',
            role: 'supervisor',
        },
        manager: {
            email: 'manager@tagwise.local',
            password: 'TagWise123!',
            displayName: 'Operations Manager',
            role: 'manager',
        },
    },
};
const runtimes = [];
(0, vitest_1.afterEach)(async () => {
    while (runtimes.length > 0) {
        const runtime = runtimes.pop();
        if (runtime) {
            await runtime.stop();
        }
    }
});
(0, vitest_1.describe)('createApiRequestHandler', () => {
    (0, vitest_1.it)('serves connected login and refresh endpoints on the API runtime', async () => {
        const database = (0, pg_mem_1.newDb)();
        const adapter = database.adapters.createPg();
        const pool = new adapter.Pool();
        await (0, migrations_1.runPostgresMigrations)(pool);
        const authService = new authService_1.AuthService(new authRepository_1.AuthRepository(pool), authConfig);
        await authService.ensureSeedUsers();
        const runtime = (0, serviceRuntime_1.createServiceRuntime)({
            serviceName: 'api-service',
            serviceRole: 'api',
            host: '127.0.0.1',
            port: 0,
            verifyDatabaseReadiness: async () => undefined,
            handleRequest: (0, createApiRequestHandler_1.createApiRequestHandler)({ authService }),
        });
        runtimes.push(runtime);
        const { port } = await runtime.start();
        const login = await fetch(`http://127.0.0.1:${port}/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                email: authConfig.seedUsers.supervisor.email,
                password: authConfig.seedUsers.supervisor.password,
            }),
        });
        (0, vitest_1.expect)(login.status).toBe(200);
        const loginBody = (await login.json());
        (0, vitest_1.expect)(loginBody.user.role).toBe('supervisor');
        const refresh = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                refreshToken: loginBody.tokens.refreshToken,
            }),
        });
        (0, vitest_1.expect)(refresh.status).toBe(200);
        (0, vitest_1.expect)((await refresh.json()).user.role).toBe('supervisor');
        await pool.end();
    });
});
