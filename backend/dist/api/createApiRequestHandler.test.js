"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const pg_mem_1 = require("pg-mem");
const createApiRequestHandler_1 = require("./createApiRequestHandler");
const auditEventRepository_1 = require("../modules/audit/auditEventRepository");
const auditEventService_1 = require("../modules/audit/auditEventService");
const authRepository_1 = require("../modules/auth/authRepository");
const authService_1 = require("../modules/auth/authService");
const assignedWorkPackageRepository_1 = require("../modules/work-packages/assignedWorkPackageRepository");
const assignedWorkPackageService_1 = require("../modules/work-packages/assignedWorkPackageService");
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
        const auditRepository = new auditEventRepository_1.AuditEventRepository(pool);
        const authService = new authService_1.AuthService(new authRepository_1.AuthRepository(pool), authConfig, new auditEventService_1.AuditEventService(auditRepository));
        await authService.ensureSeedUsers();
        const technician = await new authRepository_1.AuthRepository(pool).findByEmail(authConfig.seedUsers.technician.email);
        if (!technician) {
            throw new Error('Missing seeded technician for test.');
        }
        const assignedWorkPackageService = new assignedWorkPackageService_1.AssignedWorkPackageService(new assignedWorkPackageRepository_1.AssignedWorkPackageRepository(pool));
        await assignedWorkPackageService.ensureSeedPackages(technician.id);
        const runtime = (0, serviceRuntime_1.createServiceRuntime)({
            serviceName: 'api-service',
            serviceRole: 'api',
            host: '127.0.0.1',
            port: 0,
            verifyDatabaseReadiness: async () => undefined,
            handleRequest: (0, createApiRequestHandler_1.createApiRequestHandler)({ authService, assignedWorkPackageService }),
        });
        runtimes.push(runtime);
        const { port } = await runtime.start();
        const login = await fetch(`http://127.0.0.1:${port}/auth/login`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-correlation-id': 'corr-api-login',
            },
            body: JSON.stringify({
                email: authConfig.seedUsers.supervisor.email,
                password: authConfig.seedUsers.supervisor.password,
            }),
        });
        (0, vitest_1.expect)(login.status).toBe(200);
        (0, vitest_1.expect)(login.headers.get('x-correlation-id')).toBe('corr-api-login');
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
        const metrics = await fetch(`http://127.0.0.1:${port}/metrics`);
        const metricsBody = (await metrics.json());
        (0, vitest_1.expect)(metrics.status).toBe(200);
        (0, vitest_1.expect)(metricsBody.requestCount).toBeGreaterThanOrEqual(2);
        (0, vitest_1.expect)(metricsBody.errorRate).toBe(0);
        const auditEvents = await auditRepository.listEventsByTarget('user-session', loginBody.user.id);
        (0, vitest_1.expect)(auditEvents).toHaveLength(2);
        (0, vitest_1.expect)(auditEvents[0]?.correlationId).toBe('corr-api-login');
        (0, vitest_1.expect)(auditEvents[1]?.correlationId).toBeTruthy();
        await pool.end();
    });
    (0, vitest_1.it)('lists and downloads assigned work packages for an authenticated technician', async () => {
        const database = (0, pg_mem_1.newDb)();
        const adapter = database.adapters.createPg();
        const pool = new adapter.Pool();
        await (0, migrations_1.runPostgresMigrations)(pool);
        const authRepository = new authRepository_1.AuthRepository(pool);
        const authService = new authService_1.AuthService(authRepository, authConfig, new auditEventService_1.AuditEventService(new auditEventRepository_1.AuditEventRepository(pool)));
        await authService.ensureSeedUsers();
        const technician = await authRepository.findByEmail(authConfig.seedUsers.technician.email);
        if (!technician) {
            throw new Error('Missing seeded technician for work package test.');
        }
        const assignedWorkPackageService = new assignedWorkPackageService_1.AssignedWorkPackageService(new assignedWorkPackageRepository_1.AssignedWorkPackageRepository(pool));
        await assignedWorkPackageService.ensureSeedPackages(technician.id);
        const runtime = (0, serviceRuntime_1.createServiceRuntime)({
            serviceName: 'api-service',
            serviceRole: 'api',
            host: '127.0.0.1',
            port: 0,
            verifyDatabaseReadiness: async () => undefined,
            handleRequest: (0, createApiRequestHandler_1.createApiRequestHandler)({ authService, assignedWorkPackageService }),
        });
        runtimes.push(runtime);
        const { port } = await runtime.start();
        const login = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-work-package-login',
        });
        const listResponse = await fetch(`http://127.0.0.1:${port}/work-packages`, {
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
                'x-correlation-id': 'corr-work-package-list',
            },
        });
        const listBody = (await listResponse.json());
        (0, vitest_1.expect)(listResponse.status).toBe(200);
        (0, vitest_1.expect)(listResponse.headers.get('x-correlation-id')).toBe('corr-work-package-list');
        (0, vitest_1.expect)(listBody.items).toHaveLength(2);
        (0, vitest_1.expect)(listBody.items[0]?.tagCount).toBeGreaterThan(0);
        (0, vitest_1.expect)(listBody.items[0]?.snapshotContractVersion).toBe('2026-04-v1');
        const downloadResponse = await fetch(`http://127.0.0.1:${port}/work-packages/${listBody.items[0]?.id}/download`, {
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
                'x-correlation-id': 'corr-work-package-download',
            },
        });
        const downloadBody = (await downloadResponse.json());
        (0, vitest_1.expect)(downloadResponse.status).toBe(200);
        (0, vitest_1.expect)(downloadBody.contractVersion).toBe('2026-04-v1');
        (0, vitest_1.expect)(downloadBody.summary.id).toBe(listBody.items[0]?.id);
        (0, vitest_1.expect)(downloadBody.tags.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(downloadBody.templates.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(downloadBody.guidance.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(downloadBody.historySummaries.length).toBeGreaterThan(0);
        const unauthorizedResponse = await fetch(`http://127.0.0.1:${port}/work-packages`);
        (0, vitest_1.expect)(unauthorizedResponse.status).toBe(401);
        await pool.end();
    });
    (0, vitest_1.it)('returns actionable non-auth failure messages for work package endpoints', async () => {
        const database = (0, pg_mem_1.newDb)();
        const adapter = database.adapters.createPg();
        const pool = new adapter.Pool();
        await (0, migrations_1.runPostgresMigrations)(pool);
        const authRepository = new authRepository_1.AuthRepository(pool);
        const authService = new authService_1.AuthService(authRepository, authConfig, new auditEventService_1.AuditEventService(new auditEventRepository_1.AuditEventRepository(pool)));
        await authService.ensureSeedUsers();
        const runtime = (0, serviceRuntime_1.createServiceRuntime)({
            serviceName: 'api-service',
            serviceRole: 'api',
            host: '127.0.0.1',
            port: 0,
            verifyDatabaseReadiness: async () => undefined,
            handleRequest: (0, createApiRequestHandler_1.createApiRequestHandler)({
                authService,
                assignedWorkPackageService: {
                    listAssignedPackages: async () => {
                        throw new Error('database unavailable');
                    },
                    downloadAssignedPackage: async () => {
                        throw new Error('storage unavailable');
                    },
                    ensureSeedPackages: async () => undefined,
                },
            }),
        });
        runtimes.push(runtime);
        const { port } = await runtime.start();
        const login = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-work-package-error-login',
        });
        const listResponse = await fetch(`http://127.0.0.1:${port}/work-packages`, {
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
            },
        });
        (0, vitest_1.expect)(listResponse.status).toBe(500);
        (0, vitest_1.expect)(await listResponse.json()).toEqual({
            message: 'Assigned work package list failed. Please retry while connected.',
        });
        const downloadResponse = await fetch(`http://127.0.0.1:${port}/work-packages/wp-seed-1001/download`, {
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
            },
        });
        (0, vitest_1.expect)(downloadResponse.status).toBe(500);
        (0, vitest_1.expect)(await downloadResponse.json()).toEqual({
            message: 'Assigned work package download failed. Please retry while connected.',
        });
        await pool.end();
    });
});
