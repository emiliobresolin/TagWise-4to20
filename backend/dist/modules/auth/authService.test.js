"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const pg_mem_1 = require("pg-mem");
const migrations_1 = require("../../platform/db/migrations");
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
        const service = new authService_1.AuthService(new authRepository_1.AuthRepository(pool), authConfig);
        await service.ensureSeedUsers();
        const session = await service.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        });
        (0, vitest_1.expect)(session.user.role).toBe('technician');
        (0, vitest_1.expect)(session.tokens.accessToken).toContain('.');
        (0, vitest_1.expect)(session.tokens.refreshToken).toContain('.');
        await pool.end();
    });
    (0, vitest_1.it)('refreshes a valid session using the refresh token', async () => {
        const database = (0, pg_mem_1.newDb)();
        const adapter = database.adapters.createPg();
        const pool = new adapter.Pool();
        await (0, migrations_1.runPostgresMigrations)(pool);
        const service = new authService_1.AuthService(new authRepository_1.AuthRepository(pool), authConfig);
        await service.ensureSeedUsers();
        const login = await service.loginConnected({
            email: authConfig.seedUsers.supervisor.email,
            password: authConfig.seedUsers.supervisor.password,
        });
        const refreshed = await service.refreshConnected(login.tokens.refreshToken);
        (0, vitest_1.expect)(refreshed.user.role).toBe('supervisor');
        (0, vitest_1.expect)(refreshed.tokens.refreshTokenExpiresAt).toBeTruthy();
        await pool.end();
    });
});
