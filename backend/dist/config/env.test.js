"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const env_1 = require("./env");
const baseEnv = {
    TAGWISE_DATABASE_URL: 'postgres://tagwise:tagwise@127.0.0.1:5432/tagwise',
    TAGWISE_STORAGE_BUCKET: 'tagwise-evidence-dev',
    TAGWISE_STORAGE_REGION: 'us-east-1',
    TAGWISE_STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
    TAGWISE_STORAGE_ACCESS_KEY_ID: 'minioadmin',
    TAGWISE_STORAGE_SECRET_ACCESS_KEY: 'minioadmin',
    TAGWISE_STORAGE_FORCE_PATH_STYLE: 'true',
    TAGWISE_STORAGE_AUTO_CREATE_BUCKET: 'true',
    TAGWISE_AUTH_TOKEN_SECRET: 'development-secret',
};
(0, vitest_1.describe)('loadServiceEnvironment', () => {
    (0, vitest_1.it)('loads API configuration with role-specific defaults', () => {
        const environment = (0, env_1.loadServiceEnvironment)('api', baseEnv);
        (0, vitest_1.expect)(environment.serviceRole).toBe('api');
        (0, vitest_1.expect)(environment.port).toBe(4100);
        (0, vitest_1.expect)(environment.objectStorage.forcePathStyle).toBe(true);
        (0, vitest_1.expect)(environment.objectStorage.autoCreateBucket).toBe(true);
        (0, vitest_1.expect)(environment.auth?.seedUsers.technician.role).toBe('technician');
    });
    (0, vitest_1.it)('rejects missing required values', () => {
        (0, vitest_1.expect)(() => (0, env_1.loadServiceEnvironment)('worker', {
            ...baseEnv,
            TAGWISE_STORAGE_BUCKET: '',
        })).toThrow('TAGWISE_STORAGE_BUCKET');
    });
    (0, vitest_1.it)('does not require auth configuration for worker bootstrap', () => {
        const workerEnvironment = (0, env_1.loadServiceEnvironment)('worker', {
            ...baseEnv,
            TAGWISE_AUTH_TOKEN_SECRET: undefined,
        });
        (0, vitest_1.expect)(workerEnvironment.auth).toBeUndefined();
        (0, vitest_1.expect)(workerEnvironment.port).toBe(4101);
    });
});
