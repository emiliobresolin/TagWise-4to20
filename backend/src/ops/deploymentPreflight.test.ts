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
  TAGWISE_SEED_TECHNICIAN_PASSWORD: 'staging-tech-password',
  TAGWISE_SEED_SUPERVISOR_PASSWORD: 'staging-supervisor-password',
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
});
