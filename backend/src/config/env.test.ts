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
});
