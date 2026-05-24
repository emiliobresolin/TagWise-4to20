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
        (0, vitest_1.expect)(environment.deploymentEnvironment).toBe('development');
        (0, vitest_1.expect)(environment.port).toBe(4100);
        (0, vitest_1.expect)(environment.objectStorage.forcePathStyle).toBe(true);
        (0, vitest_1.expect)(environment.objectStorage.autoCreateBucket).toBe(true);
        (0, vitest_1.expect)(environment.auth?.seedUsers.technician.role).toBe('technician');
        (0, vitest_1.expect)(environment.ai).toEqual({
            enabled: false,
            provider: 'mock',
            requestTimeoutMs: 30000,
        });
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
    (0, vitest_1.it)('loads enabled mock AI configuration without OpenAI credentials', () => {
        const environment = (0, env_1.loadServiceEnvironment)('worker', {
            ...baseEnv,
            TAGWISE_AI_ENABLED: 'true',
            TAGWISE_AI_PROVIDER: 'mock',
            TAGWISE_AI_REQUEST_TIMEOUT_MS: '15000',
            OPENAI_API_KEY: undefined,
            OPENAI_MODEL: undefined,
        });
        (0, vitest_1.expect)(environment.ai).toEqual({
            enabled: true,
            provider: 'mock',
            requestTimeoutMs: 15000,
        });
    });
    (0, vitest_1.it)('does not require OpenAI credentials when AI is disabled', () => {
        const environment = (0, env_1.loadServiceEnvironment)('worker', {
            ...baseEnv,
            TAGWISE_AI_ENABLED: 'false',
            TAGWISE_AI_PROVIDER: 'openai',
            OPENAI_API_KEY: undefined,
            OPENAI_MODEL: undefined,
        });
        (0, vitest_1.expect)(environment.ai).toEqual({
            enabled: false,
            provider: 'openai',
            requestTimeoutMs: 30000,
        });
    });
    (0, vitest_1.it)('loads OpenAI AI configuration only when key and model are present', () => {
        const environment = (0, env_1.loadServiceEnvironment)('worker', {
            ...baseEnv,
            TAGWISE_AI_ENABLED: 'true',
            TAGWISE_AI_PROVIDER: 'openai',
            OPENAI_API_KEY: 'sk-test-key',
            OPENAI_MODEL: 'gpt-5-mini',
        });
        (0, vitest_1.expect)(environment.ai).toEqual({
            enabled: true,
            provider: 'openai',
            requestTimeoutMs: 30000,
            openAi: {
                apiKey: 'sk-test-key',
                model: 'gpt-5-mini',
            },
        });
    });
    (0, vitest_1.it)('requires OpenAI credentials and model only for enabled OpenAI AI configuration', () => {
        (0, vitest_1.expect)(() => (0, env_1.loadServiceEnvironment)('worker', {
            ...baseEnv,
            TAGWISE_AI_ENABLED: 'true',
            TAGWISE_AI_PROVIDER: 'openai',
            OPENAI_API_KEY: undefined,
            OPENAI_MODEL: 'gpt-5-mini',
        })).toThrow('OPENAI_API_KEY');
        (0, vitest_1.expect)(() => (0, env_1.loadServiceEnvironment)('worker', {
            ...baseEnv,
            TAGWISE_AI_ENABLED: 'true',
            TAGWISE_AI_PROVIDER: 'openai',
            OPENAI_API_KEY: 'sk-test-key',
            OPENAI_MODEL: '',
        })).toThrow('OPENAI_MODEL');
    });
    (0, vitest_1.it)('rejects unsafe AI provider configuration values', () => {
        (0, vitest_1.expect)(() => (0, env_1.loadServiceEnvironment)('worker', {
            ...baseEnv,
            TAGWISE_AI_PROVIDER: 'unsupported',
        })).toThrow('TAGWISE_AI_PROVIDER');
        (0, vitest_1.expect)(() => (0, env_1.loadServiceEnvironment)('worker', {
            ...baseEnv,
            TAGWISE_AI_REQUEST_TIMEOUT_MS: '0',
        })).toThrow('TAGWISE_AI_REQUEST_TIMEOUT_MS');
        (0, vitest_1.expect)(() => (0, env_1.loadServiceEnvironment)('worker', {
            ...baseEnv,
            TAGWISE_AI_ENABLED: 'true',
            TAGWISE_AI_PROVIDER: 'openai',
            OPENAI_API_KEY: '<set-in-secret-manager>',
            OPENAI_MODEL: 'gpt-5-mini',
        })).toThrow('OPENAI_API_KEY');
    });
    (0, vitest_1.it)('allows release placeholder OpenAI values while AI is disabled', () => {
        const environment = (0, env_1.loadServiceEnvironment)('worker', {
            ...baseEnv,
            TAGWISE_DEPLOYMENT_ENV: 'production',
            TAGWISE_NODE_ENV: 'production',
            TAGWISE_DATABASE_URL: 'postgres://tagwise_app:prod-password@prod-db.internal:5432/tagwise',
            TAGWISE_STORAGE_BUCKET: 'tagwise-evidence-prod',
            TAGWISE_STORAGE_ENDPOINT: undefined,
            TAGWISE_STORAGE_AUTO_CREATE_BUCKET: 'false',
            TAGWISE_STORAGE_ACCESS_KEY_ID: 'prod-access-key',
            TAGWISE_STORAGE_SECRET_ACCESS_KEY: 'prod-secret-key',
            TAGWISE_AI_ENABLED: 'false',
            TAGWISE_AI_PROVIDER: 'openai',
            OPENAI_API_KEY: '<set-in-secret-manager>',
            OPENAI_MODEL: '<production-openai-model>',
        });
        (0, vitest_1.expect)(environment.ai).toEqual({
            enabled: false,
            provider: 'openai',
            requestTimeoutMs: 30000,
        });
    });
    (0, vitest_1.it)('requires release environments to use explicit non-development secrets', () => {
        (0, vitest_1.expect)(() => (0, env_1.loadServiceEnvironment)('api', {
            ...baseEnv,
            TAGWISE_DEPLOYMENT_ENV: 'staging',
            TAGWISE_NODE_ENV: 'production',
            TAGWISE_DATABASE_URL: 'postgres://tagwise_app:staging-password@staging-db.internal:5432/tagwise',
            TAGWISE_STORAGE_ENDPOINT: undefined,
            TAGWISE_STORAGE_AUTO_CREATE_BUCKET: 'false',
            TAGWISE_STORAGE_ACCESS_KEY_ID: 'staging-access-key',
            TAGWISE_STORAGE_SECRET_ACCESS_KEY: 'staging-secret-key',
            TAGWISE_AUTH_TOKEN_SECRET: 'development-secret',
        })).toThrow('TAGWISE_AUTH_TOKEN_SECRET');
    });
    (0, vitest_1.it)('rejects production node runtime when deployment guardrails are disabled', () => {
        (0, vitest_1.expect)(() => (0, env_1.loadServiceEnvironment)('worker', {
            ...baseEnv,
            TAGWISE_NODE_ENV: 'production',
            TAGWISE_DEPLOYMENT_ENV: 'development',
        })).toThrow('TAGWISE_DEPLOYMENT_ENV=development');
    });
    (0, vitest_1.it)('rejects placeholder release database URLs before preflight can pass', () => {
        (0, vitest_1.expect)(() => (0, env_1.loadServiceEnvironment)('worker', {
            ...baseEnv,
            TAGWISE_DEPLOYMENT_ENV: 'production',
            TAGWISE_NODE_ENV: 'production',
            TAGWISE_DATABASE_URL: 'postgres://tagwise_app:<set-in-secret-manager>@<production-postgres-host>:5432/tagwise',
            TAGWISE_STORAGE_BUCKET: 'tagwise-evidence-prod',
            TAGWISE_STORAGE_AUTO_CREATE_BUCKET: 'false',
            TAGWISE_STORAGE_ACCESS_KEY_ID: 'prod-access-key',
            TAGWISE_STORAGE_SECRET_ACCESS_KEY: 'prod-secret-key',
        })).toThrow('TAGWISE_DATABASE_URL');
    });
    (0, vitest_1.it)('rejects invalid release database URLs', () => {
        (0, vitest_1.expect)(() => (0, env_1.loadServiceEnvironment)('worker', {
            ...baseEnv,
            TAGWISE_DEPLOYMENT_ENV: 'staging',
            TAGWISE_NODE_ENV: 'production',
            TAGWISE_DATABASE_URL: 'not-a-database-url',
            TAGWISE_STORAGE_BUCKET: 'tagwise-evidence-staging',
            TAGWISE_STORAGE_AUTO_CREATE_BUCKET: 'false',
            TAGWISE_STORAGE_ACCESS_KEY_ID: 'staging-access-key',
            TAGWISE_STORAGE_SECRET_ACCESS_KEY: 'staging-secret-key',
        })).toThrow('parseable PostgreSQL database URL');
    });
    (0, vitest_1.it)('rejects placeholder release storage and seed identity values', () => {
        (0, vitest_1.expect)(() => (0, env_1.loadServiceEnvironment)('api', {
            ...baseEnv,
            TAGWISE_DEPLOYMENT_ENV: 'production',
            TAGWISE_NODE_ENV: 'production',
            TAGWISE_DATABASE_URL: 'postgres://tagwise_app:prod-password@prod-db.internal:5432/tagwise',
            TAGWISE_STORAGE_BUCKET: 'tagwise-evidence-prod',
            TAGWISE_STORAGE_ENDPOINT: undefined,
            TAGWISE_STORAGE_AUTO_CREATE_BUCKET: 'false',
            TAGWISE_STORAGE_ACCESS_KEY_ID: '<set-in-secret-manager>',
            TAGWISE_STORAGE_SECRET_ACCESS_KEY: 'prod-secret-key',
            TAGWISE_AUTH_TOKEN_SECRET: 'prod-token-secret-with-enough-length',
            TAGWISE_SEED_TECHNICIAN_EMAIL: 'tech.production@example.com',
            TAGWISE_SEED_TECHNICIAN_PASSWORD: 'prod-tech-password',
            TAGWISE_SEED_SUPERVISOR_EMAIL: '<production-supervisor-email>',
            TAGWISE_SEED_SUPERVISOR_PASSWORD: 'prod-supervisor-password',
            TAGWISE_SEED_MANAGER_EMAIL: 'manager.production@example.com',
            TAGWISE_SEED_MANAGER_PASSWORD: 'prod-manager-password',
        })).toThrow('TAGWISE_STORAGE_ACCESS_KEY_ID');
    });
    (0, vitest_1.it)('rejects placeholder release seed emails after storage guardrails pass', () => {
        (0, vitest_1.expect)(() => (0, env_1.loadServiceEnvironment)('api', {
            ...baseEnv,
            TAGWISE_DEPLOYMENT_ENV: 'production',
            TAGWISE_NODE_ENV: 'production',
            TAGWISE_DATABASE_URL: 'postgres://tagwise_app:prod-password@prod-db.internal:5432/tagwise',
            TAGWISE_STORAGE_BUCKET: 'tagwise-evidence-prod',
            TAGWISE_STORAGE_ENDPOINT: undefined,
            TAGWISE_STORAGE_AUTO_CREATE_BUCKET: 'false',
            TAGWISE_STORAGE_ACCESS_KEY_ID: 'prod-access-key',
            TAGWISE_STORAGE_SECRET_ACCESS_KEY: 'prod-secret-key',
            TAGWISE_AUTH_TOKEN_SECRET: 'prod-token-secret-with-enough-length',
            TAGWISE_SEED_TECHNICIAN_EMAIL: '<production-technician-email>',
            TAGWISE_SEED_TECHNICIAN_PASSWORD: 'prod-tech-password',
            TAGWISE_SEED_SUPERVISOR_EMAIL: 'supervisor.production@example.com',
            TAGWISE_SEED_SUPERVISOR_PASSWORD: 'prod-supervisor-password',
            TAGWISE_SEED_MANAGER_EMAIL: 'manager.production@example.com',
            TAGWISE_SEED_MANAGER_PASSWORD: 'prod-manager-password',
        })).toThrow('TAGWISE_SEED_TECHNICIAN_EMAIL');
    });
    (0, vitest_1.it)('rejects local database and auto-created storage in release environments', () => {
        (0, vitest_1.expect)(() => (0, env_1.loadServiceEnvironment)('worker', {
            ...baseEnv,
            TAGWISE_DEPLOYMENT_ENV: 'production',
            TAGWISE_NODE_ENV: 'production',
            TAGWISE_STORAGE_AUTO_CREATE_BUCKET: 'true',
            TAGWISE_STORAGE_ACCESS_KEY_ID: 'prod-access-key',
            TAGWISE_STORAGE_SECRET_ACCESS_KEY: 'prod-secret-key',
        })).toThrow('managed database URL');
    });
    (0, vitest_1.it)('loads production configuration when release guardrails are satisfied', () => {
        const environment = (0, env_1.loadServiceEnvironment)('api', {
            ...baseEnv,
            TAGWISE_DEPLOYMENT_ENV: 'production',
            TAGWISE_NODE_ENV: 'production',
            TAGWISE_HOST: '0.0.0.0',
            TAGWISE_DATABASE_URL: 'postgres://tagwise_app:prod-password@prod-db.internal:5432/tagwise',
            TAGWISE_STORAGE_BUCKET: 'tagwise-evidence-prod',
            TAGWISE_STORAGE_ENDPOINT: undefined,
            TAGWISE_STORAGE_ACCESS_KEY_ID: 'prod-access-key',
            TAGWISE_STORAGE_SECRET_ACCESS_KEY: 'prod-secret-key',
            TAGWISE_STORAGE_FORCE_PATH_STYLE: 'false',
            TAGWISE_STORAGE_AUTO_CREATE_BUCKET: 'false',
            TAGWISE_AUTH_TOKEN_SECRET: 'prod-token-secret-with-enough-length',
            TAGWISE_SEED_TECHNICIAN_EMAIL: 'tech.production@example.com',
            TAGWISE_SEED_TECHNICIAN_PASSWORD: 'prod-tech-password',
            TAGWISE_SEED_SUPERVISOR_EMAIL: 'supervisor.production@example.com',
            TAGWISE_SEED_SUPERVISOR_PASSWORD: 'prod-supervisor-password',
            TAGWISE_SEED_MANAGER_EMAIL: 'manager.production@example.com',
            TAGWISE_SEED_MANAGER_PASSWORD: 'prod-manager-password',
        });
        (0, vitest_1.expect)(environment.deploymentEnvironment).toBe('production');
        (0, vitest_1.expect)(environment.nodeEnv).toBe('production');
        (0, vitest_1.expect)(environment.host).toBe('0.0.0.0');
        (0, vitest_1.expect)(environment.objectStorage.autoCreateBucket).toBe(false);
    });
});
