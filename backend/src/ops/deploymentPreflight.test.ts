import { describe, expect, it } from 'vitest';

import { buildDeploymentPreflightReport } from './deploymentPreflight';

const releaseEnv = {
  TAGWISE_DEPLOYMENT_ENV: 'staging',
  TAGWISE_NODE_ENV: 'production',
  TAGWISE_HOST: '0.0.0.0',
  TAGWISE_API_PORT: '4100',
  TAGWISE_WORKER_PORT: '4101',
  TAGWISE_DATABASE_URL:
    'postgres://tagwise_app:staging-password@staging-db.internal:5432/tagwise',
  TAGWISE_STORAGE_BUCKET: 'tagwise-evidence-staging',
  TAGWISE_STORAGE_REGION: 'us-east-1',
  TAGWISE_STORAGE_ACCESS_KEY_ID: 'staging-access-key',
  TAGWISE_STORAGE_SECRET_ACCESS_KEY: 'staging-secret-key',
  TAGWISE_STORAGE_FORCE_PATH_STYLE: 'false',
  TAGWISE_STORAGE_AUTO_CREATE_BUCKET: 'false',
  TAGWISE_AUTH_TOKEN_SECRET: 'staging-token-secret-with-enough-length',
  TAGWISE_SEED_TECHNICIAN_EMAIL: 'tech.staging@example.com',
  TAGWISE_SEED_TECHNICIAN_PASSWORD: 'staging-tech-password',
  TAGWISE_SEED_SUPERVISOR_EMAIL: 'supervisor.staging@example.com',
  TAGWISE_SEED_SUPERVISOR_PASSWORD: 'staging-supervisor-password',
  TAGWISE_SEED_MANAGER_EMAIL: 'manager.staging@example.com',
  TAGWISE_SEED_MANAGER_PASSWORD: 'staging-manager-password',
} satisfies NodeJS.ProcessEnv;

describe('buildDeploymentPreflightReport', () => {
  it('summarizes release configuration without exposing secrets', () => {
    const report = buildDeploymentPreflightReport(releaseEnv);

    expect(report.deploymentEnvironment).toBe('staging');
    expect(report.services).toEqual([
      { role: 'api', host: '0.0.0.0', port: 4100 },
      { role: 'worker', host: '0.0.0.0', port: 4101 },
    ]);
    expect(report.database.redactedUrl).not.toContain('staging-password');
    expect(report.secrets.valuesRedacted).toBe(true);
  });

  it('fails when release configuration uses development storage behavior', () => {
    expect(() =>
      buildDeploymentPreflightReport({
        ...releaseEnv,
        TAGWISE_STORAGE_AUTO_CREATE_BUCKET: 'true',
      }),
    ).toThrow('auto-create object storage buckets');
  });

  it.each([
    {
      deploymentEnvironment: 'staging',
      databaseHost: '<staging-postgres-host>',
      seedEmail: '<staging-technician-email>',
    },
    {
      deploymentEnvironment: 'production',
      databaseHost: '<production-postgres-host>',
      seedEmail: '<production-technician-email>',
    },
  ])('fails when $deploymentEnvironment template placeholders are still present', ({
    deploymentEnvironment,
    databaseHost,
    seedEmail,
  }) => {
    expect(() =>
      buildDeploymentPreflightReport({
        ...releaseEnv,
        TAGWISE_DEPLOYMENT_ENV: deploymentEnvironment,
        TAGWISE_DATABASE_URL:
          `postgres://tagwise_app:<set-in-secret-manager>@${databaseHost}:5432/tagwise`,
        TAGWISE_STORAGE_ACCESS_KEY_ID: '<set-in-secret-manager>',
        TAGWISE_STORAGE_SECRET_ACCESS_KEY: '<set-in-secret-manager>',
        TAGWISE_AUTH_TOKEN_SECRET: '<set-in-secret-manager>',
        TAGWISE_SEED_TECHNICIAN_EMAIL: seedEmail,
        TAGWISE_SEED_TECHNICIAN_PASSWORD: '<set-in-secret-manager>',
      }),
    ).toThrow('TAGWISE_DATABASE_URL');
  });

  it('fails when release database configuration is not parseable', () => {
    expect(() =>
      buildDeploymentPreflightReport({
        ...releaseEnv,
        TAGWISE_DATABASE_URL: 'not-a-url',
      }),
    ).toThrow('parseable PostgreSQL database URL');
  });
});
