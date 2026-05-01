import { describe, expect, it } from 'vitest';

import { loadServiceEnvironment } from './env';

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
} satisfies NodeJS.ProcessEnv;

describe('loadServiceEnvironment', () => {
  it('loads API configuration with role-specific defaults', () => {
    const environment = loadServiceEnvironment('api', baseEnv);

    expect(environment.serviceRole).toBe('api');
    expect(environment.deploymentEnvironment).toBe('development');
    expect(environment.port).toBe(4100);
    expect(environment.objectStorage.forcePathStyle).toBe(true);
    expect(environment.objectStorage.autoCreateBucket).toBe(true);
    expect(environment.auth?.seedUsers.technician.role).toBe('technician');
  });

  it('rejects missing required values', () => {
    expect(() =>
      loadServiceEnvironment('worker', {
        ...baseEnv,
        TAGWISE_STORAGE_BUCKET: '',
      }),
    ).toThrow('TAGWISE_STORAGE_BUCKET');
  });

  it('does not require auth configuration for worker bootstrap', () => {
    const workerEnvironment = loadServiceEnvironment('worker', {
      ...baseEnv,
      TAGWISE_AUTH_TOKEN_SECRET: undefined,
    });

    expect(workerEnvironment.auth).toBeUndefined();
    expect(workerEnvironment.port).toBe(4101);
  });

  it('requires release environments to use explicit non-development secrets', () => {
    expect(() =>
      loadServiceEnvironment('api', {
        ...baseEnv,
        TAGWISE_DEPLOYMENT_ENV: 'staging',
        TAGWISE_NODE_ENV: 'production',
        TAGWISE_DATABASE_URL:
          'postgres://tagwise_app:staging-password@staging-db.internal:5432/tagwise',
        TAGWISE_STORAGE_ENDPOINT: undefined,
        TAGWISE_STORAGE_AUTO_CREATE_BUCKET: 'false',
        TAGWISE_STORAGE_ACCESS_KEY_ID: 'staging-access-key',
        TAGWISE_STORAGE_SECRET_ACCESS_KEY: 'staging-secret-key',
        TAGWISE_AUTH_TOKEN_SECRET: 'development-secret',
      }),
    ).toThrow('TAGWISE_AUTH_TOKEN_SECRET');
  });

  it('rejects production node runtime when deployment guardrails are disabled', () => {
    expect(() =>
      loadServiceEnvironment('worker', {
        ...baseEnv,
        TAGWISE_NODE_ENV: 'production',
        TAGWISE_DEPLOYMENT_ENV: 'development',
      }),
    ).toThrow('TAGWISE_DEPLOYMENT_ENV=development');
  });

  it('rejects placeholder release database URLs before preflight can pass', () => {
    expect(() =>
      loadServiceEnvironment('worker', {
        ...baseEnv,
        TAGWISE_DEPLOYMENT_ENV: 'production',
        TAGWISE_NODE_ENV: 'production',
        TAGWISE_DATABASE_URL:
          'postgres://tagwise_app:<set-in-secret-manager>@<production-postgres-host>:5432/tagwise',
        TAGWISE_STORAGE_BUCKET: 'tagwise-evidence-prod',
        TAGWISE_STORAGE_AUTO_CREATE_BUCKET: 'false',
        TAGWISE_STORAGE_ACCESS_KEY_ID: 'prod-access-key',
        TAGWISE_STORAGE_SECRET_ACCESS_KEY: 'prod-secret-key',
      }),
    ).toThrow('TAGWISE_DATABASE_URL');
  });

  it('rejects invalid release database URLs', () => {
    expect(() =>
      loadServiceEnvironment('worker', {
        ...baseEnv,
        TAGWISE_DEPLOYMENT_ENV: 'staging',
        TAGWISE_NODE_ENV: 'production',
        TAGWISE_DATABASE_URL: 'not-a-database-url',
        TAGWISE_STORAGE_BUCKET: 'tagwise-evidence-staging',
        TAGWISE_STORAGE_AUTO_CREATE_BUCKET: 'false',
        TAGWISE_STORAGE_ACCESS_KEY_ID: 'staging-access-key',
        TAGWISE_STORAGE_SECRET_ACCESS_KEY: 'staging-secret-key',
      }),
    ).toThrow('parseable PostgreSQL database URL');
  });

  it('rejects placeholder release storage and seed identity values', () => {
    expect(() =>
      loadServiceEnvironment('api', {
        ...baseEnv,
        TAGWISE_DEPLOYMENT_ENV: 'production',
        TAGWISE_NODE_ENV: 'production',
        TAGWISE_DATABASE_URL:
          'postgres://tagwise_app:prod-password@prod-db.internal:5432/tagwise',
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
      }),
    ).toThrow('TAGWISE_STORAGE_ACCESS_KEY_ID');
  });

  it('rejects placeholder release seed emails after storage guardrails pass', () => {
    expect(() =>
      loadServiceEnvironment('api', {
        ...baseEnv,
        TAGWISE_DEPLOYMENT_ENV: 'production',
        TAGWISE_NODE_ENV: 'production',
        TAGWISE_DATABASE_URL:
          'postgres://tagwise_app:prod-password@prod-db.internal:5432/tagwise',
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
      }),
    ).toThrow('TAGWISE_SEED_TECHNICIAN_EMAIL');
  });

  it('rejects local database and auto-created storage in release environments', () => {
    expect(() =>
      loadServiceEnvironment('worker', {
        ...baseEnv,
        TAGWISE_DEPLOYMENT_ENV: 'production',
        TAGWISE_NODE_ENV: 'production',
        TAGWISE_STORAGE_AUTO_CREATE_BUCKET: 'true',
        TAGWISE_STORAGE_ACCESS_KEY_ID: 'prod-access-key',
        TAGWISE_STORAGE_SECRET_ACCESS_KEY: 'prod-secret-key',
      }),
    ).toThrow('managed database URL');
  });

  it('loads production configuration when release guardrails are satisfied', () => {
    const environment = loadServiceEnvironment('api', {
      ...baseEnv,
      TAGWISE_DEPLOYMENT_ENV: 'production',
      TAGWISE_NODE_ENV: 'production',
      TAGWISE_HOST: '0.0.0.0',
      TAGWISE_DATABASE_URL:
        'postgres://tagwise_app:prod-password@prod-db.internal:5432/tagwise',
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

    expect(environment.deploymentEnvironment).toBe('production');
    expect(environment.nodeEnv).toBe('production');
    expect(environment.host).toBe('0.0.0.0');
    expect(environment.objectStorage.autoCreateBucket).toBe(false);
  });
});
