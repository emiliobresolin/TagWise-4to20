"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const pg_mem_1 = require("pg-mem");
const migrations_1 = require("../../platform/db/migrations");
const auditEventRepository_1 = require("../audit/auditEventRepository");
const auditEventService_1 = require("../audit/auditEventService");
const authRepository_1 = require("./authRepository");
const authService_1 = require("./authService");
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
(0, vitest_1.describe)('AuthService', () => {
    (0, vitest_1.it)('authenticates a seeded connected user and issues token pair', async () => {
        const database = (0, pg_mem_1.newDb)();
        const adapter = database.adapters.createPg();
        const pool = new adapter.Pool();
        await (0, migrations_1.runPostgresMigrations)(pool);
        const auditRepository = new auditEventRepository_1.AuditEventRepository(pool);
        const service = new authService_1.AuthService(new authRepository_1.AuthRepository(pool), authConfig, new auditEventService_1.AuditEventService(auditRepository));
        await service.ensureSeedUsers();
        const session = await service.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-login-test',
        });
        (0, vitest_1.expect)(session.user.role).toBe('technician');
        (0, vitest_1.expect)(session.tokens.accessToken).toContain('.');
        (0, vitest_1.expect)(session.tokens.refreshToken).toContain('.');
        (0, vitest_1.expect)(await auditRepository.listEventsByTarget('user-session', session.user.id)).toHaveLength(1);
        await pool.end();
    });
    (0, vitest_1.it)('refreshes a valid session using the refresh token', async () => {
        const database = (0, pg_mem_1.newDb)();
        const adapter = database.adapters.createPg();
        const pool = new adapter.Pool();
        await (0, migrations_1.runPostgresMigrations)(pool);
        const auditRepository = new auditEventRepository_1.AuditEventRepository(pool);
        const service = new authService_1.AuthService(new authRepository_1.AuthRepository(pool), authConfig, new auditEventService_1.AuditEventService(auditRepository));
        await service.ensureSeedUsers();
        const login = await service.loginConnected({
            email: authConfig.seedUsers.supervisor.email,
            password: authConfig.seedUsers.supervisor.password,
        }, {
            correlationId: 'corr-refresh-login',
        });
        const refreshed = await service.refreshConnected(login.tokens.refreshToken, {
            correlationId: 'corr-refresh',
        });
        (0, vitest_1.expect)(refreshed.user.role).toBe('supervisor');
        (0, vitest_1.expect)(refreshed.tokens.refreshTokenExpiresAt).toBeTruthy();
        (0, vitest_1.expect)(await auditRepository.listEventsByTarget('user-session', refreshed.user.id)).toHaveLength(2);
        await pool.end();
    });
});
