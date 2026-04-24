import { afterEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';

import { createApiRequestHandler } from './createApiRequestHandler';
import { AuditEventRepository } from '../modules/audit/auditEventRepository';
import { AuditEventService } from '../modules/audit/auditEventService';
import { AuthRepository } from '../modules/auth/authRepository';
import { AuthService } from '../modules/auth/authService';
import { EvidenceSyncRepository } from '../modules/evidence-sync/evidenceSyncRepository';
import { EvidenceSyncService } from '../modules/evidence-sync/evidenceSyncService';
import { AssignedWorkPackageRepository } from '../modules/work-packages/assignedWorkPackageRepository';
import { AssignedWorkPackageService } from '../modules/work-packages/assignedWorkPackageService';
import { createServiceRuntime, type ServiceRuntimeHandle } from '../runtime/serviceRuntime';
import { runPostgresMigrations } from '../platform/db/migrations';
import type { EvidenceObjectStorageClient } from '../platform/storage/objectStorage';

const authConfig = {
  tokenSecret: 'unit-test-secret',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 3600,
  seedUsers: {
    technician: {
      email: 'tech@tagwise.local',
      password: 'TagWise123!',
      displayName: 'Field Technician',
      role: 'technician' as const,
    },
    supervisor: {
      email: 'supervisor@tagwise.local',
      password: 'TagWise123!',
      displayName: 'Field Supervisor',
      role: 'supervisor' as const,
    },
    manager: {
      email: 'manager@tagwise.local',
      password: 'TagWise123!',
      displayName: 'Operations Manager',
      role: 'manager' as const,
    },
  },
};

const runtimes: ServiceRuntimeHandle[] = [];

afterEach(async () => {
  while (runtimes.length > 0) {
    const runtime = runtimes.pop();
    if (runtime) {
      await runtime.stop();
    }
  }
});

describe('createApiRequestHandler', () => {
  it('serves connected login and refresh endpoints on the API runtime', async () => {
    const database = newDb();
    const adapter = database.adapters.createPg();
    const pool = new adapter.Pool();
    await runPostgresMigrations(pool);

    const auditRepository = new AuditEventRepository(pool);
    const authService = new AuthService(
      new AuthRepository(pool),
      authConfig,
      new AuditEventService(auditRepository),
    );
    await authService.ensureSeedUsers();
    const technician = await new AuthRepository(pool).findByEmail(authConfig.seedUsers.technician.email);
    if (!technician) {
      throw new Error('Missing seeded technician for test.');
    }
    const assignedWorkPackageService = new AssignedWorkPackageService(
      new AssignedWorkPackageRepository(pool),
    );
    await assignedWorkPackageService.ensureSeedPackages(technician.id);
    const evidenceSyncService = new EvidenceSyncService(
      new EvidenceSyncRepository(pool),
      createTestEvidenceObjectStorageClient(),
    );

    const runtime = createServiceRuntime({
      serviceName: 'api-service',
      serviceRole: 'api',
      host: '127.0.0.1',
      port: 0,
      verifyDatabaseReadiness: async () => undefined,
      handleRequest: createApiRequestHandler({
        authService,
        assignedWorkPackageService,
        evidenceSyncService,
      }),
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

    expect(login.status).toBe(200);
    expect(login.headers.get('x-correlation-id')).toBe('corr-api-login');
    const loginBody = (await login.json()) as {
      tokens: { refreshToken: string };
      user: { id: string; role: string };
    };
    expect(loginBody.user.role).toBe('supervisor');

    const refresh = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        refreshToken: loginBody.tokens.refreshToken,
      }),
    });

    expect(refresh.status).toBe(200);
    expect(((await refresh.json()) as { user: { role: string } }).user.role).toBe('supervisor');

    const metrics = await fetch(`http://127.0.0.1:${port}/metrics`);
    const metricsBody = (await metrics.json()) as { requestCount: number; errorRate: number };

    expect(metrics.status).toBe(200);
    expect(metricsBody.requestCount).toBeGreaterThanOrEqual(2);
    expect(metricsBody.errorRate).toBe(0);

    const auditEvents = await auditRepository.listEventsByTarget('user-session', loginBody.user.id);
    expect(auditEvents).toHaveLength(2);
    expect(auditEvents[0]?.correlationId).toBe('corr-api-login');
    expect(auditEvents[1]?.correlationId).toBeTruthy();

    await pool.end();
  });

  it('lists and downloads assigned work packages for an authenticated technician', async () => {
    const database = newDb();
    const adapter = database.adapters.createPg();
    const pool = new adapter.Pool();
    await runPostgresMigrations(pool);

    const authRepository = new AuthRepository(pool);
    const authService = new AuthService(
      authRepository,
      authConfig,
      new AuditEventService(new AuditEventRepository(pool)),
    );
    await authService.ensureSeedUsers();
    const technician = await authRepository.findByEmail(authConfig.seedUsers.technician.email);
    if (!technician) {
      throw new Error('Missing seeded technician for work package test.');
    }

    const assignedWorkPackageService = new AssignedWorkPackageService(
      new AssignedWorkPackageRepository(pool),
    );
    await assignedWorkPackageService.ensureSeedPackages(technician.id);
    const evidenceSyncService = new EvidenceSyncService(
      new EvidenceSyncRepository(pool),
      createTestEvidenceObjectStorageClient(),
    );

    const runtime = createServiceRuntime({
      serviceName: 'api-service',
      serviceRole: 'api',
      host: '127.0.0.1',
      port: 0,
      verifyDatabaseReadiness: async () => undefined,
      handleRequest: createApiRequestHandler({
        authService,
        assignedWorkPackageService,
        evidenceSyncService,
      }),
    });
    runtimes.push(runtime);

    const { port } = await runtime.start();
    const login = await authService.loginConnected(
      {
        email: authConfig.seedUsers.technician.email,
        password: authConfig.seedUsers.technician.password,
      },
      {
        correlationId: 'corr-work-package-login',
      },
    );

    const listResponse = await fetch(`http://127.0.0.1:${port}/work-packages`, {
      headers: {
        authorization: `Bearer ${login.tokens.accessToken}`,
        'x-correlation-id': 'corr-work-package-list',
      },
    });
    const listBody = (await listResponse.json()) as {
      items: Array<{ id: string; tagCount: number; snapshotContractVersion: string }>;
    };

    expect(listResponse.status).toBe(200);
    expect(listResponse.headers.get('x-correlation-id')).toBe('corr-work-package-list');
    expect(listBody.items).toHaveLength(2);
    expect(listBody.items[0]?.tagCount).toBeGreaterThan(0);
    expect(listBody.items[0]?.snapshotContractVersion).toBe('2026-04-v1');

    const downloadResponse = await fetch(
      `http://127.0.0.1:${port}/work-packages/${listBody.items[0]?.id}/download`,
      {
        headers: {
          authorization: `Bearer ${login.tokens.accessToken}`,
          'x-correlation-id': 'corr-work-package-download',
        },
      },
    );
    const downloadBody = (await downloadResponse.json()) as {
      contractVersion: string;
      summary: { id: string };
      tags: Array<{ id: string }>;
      templates: Array<{ id: string }>;
      guidance: Array<{ id: string }>;
      historySummaries: Array<{ id: string }>;
    };

    expect(downloadResponse.status).toBe(200);
    expect(downloadBody.contractVersion).toBe('2026-04-v1');
    expect(downloadBody.summary.id).toBe(listBody.items[0]?.id);
    expect(downloadBody.tags.length).toBeGreaterThan(0);
    expect(downloadBody.templates.length).toBeGreaterThan(0);
    expect(downloadBody.guidance.length).toBeGreaterThan(0);
    expect(downloadBody.historySummaries.length).toBeGreaterThan(0);

    const unauthorizedResponse = await fetch(`http://127.0.0.1:${port}/work-packages`);
    expect(unauthorizedResponse.status).toBe(401);

    await pool.end();
  });

  it('returns actionable non-auth failure messages for work package endpoints', async () => {
    const database = newDb();
    const adapter = database.adapters.createPg();
    const pool = new adapter.Pool();
    await runPostgresMigrations(pool);

    const authRepository = new AuthRepository(pool);
    const authService = new AuthService(
      authRepository,
      authConfig,
      new AuditEventService(new AuditEventRepository(pool)),
    );
    await authService.ensureSeedUsers();

    const runtime = createServiceRuntime({
      serviceName: 'api-service',
      serviceRole: 'api',
      host: '127.0.0.1',
      port: 0,
      verifyDatabaseReadiness: async () => undefined,
      handleRequest: createApiRequestHandler({
        authService,
        assignedWorkPackageService: {
          listAssignedPackages: async () => {
            throw new Error('database unavailable');
          },
          downloadAssignedPackage: async () => {
            throw new Error('storage unavailable');
          },
          ensureSeedPackages: async () => undefined,
        } as unknown as AssignedWorkPackageService,
        evidenceSyncService: new EvidenceSyncService(
          new EvidenceSyncRepository(pool),
          createTestEvidenceObjectStorageClient(),
        ),
      }),
    });
    runtimes.push(runtime);

    const { port } = await runtime.start();
    const login = await authService.loginConnected(
      {
        email: authConfig.seedUsers.technician.email,
        password: authConfig.seedUsers.technician.password,
      },
      {
        correlationId: 'corr-work-package-error-login',
      },
    );

    const listResponse = await fetch(`http://127.0.0.1:${port}/work-packages`, {
      headers: {
        authorization: `Bearer ${login.tokens.accessToken}`,
      },
    });
    expect(listResponse.status).toBe(500);
    expect(await listResponse.json()).toEqual({
      message: 'Assigned work package list failed. Please retry while connected.',
    });

    const downloadResponse = await fetch(`http://127.0.0.1:${port}/work-packages/wp-seed-1001/download`, {
      headers: {
        authorization: `Bearer ${login.tokens.accessToken}`,
      },
    });
    expect(downloadResponse.status).toBe(500);
    expect(await downloadResponse.json()).toEqual({
      message: 'Assigned work package download failed. Please retry while connected.',
    });

    await pool.end();
  });

  it('syncs evidence metadata, issues upload authorization, and finalizes binary presence', async () => {
    const database = newDb();
    const adapter = database.adapters.createPg();
    const pool = new adapter.Pool();
    await runPostgresMigrations(pool);

    const authRepository = new AuthRepository(pool);
    const authService = new AuthService(
      authRepository,
      authConfig,
      new AuditEventService(new AuditEventRepository(pool)),
    );
    await authService.ensureSeedUsers();
    const technician = await authRepository.findByEmail(authConfig.seedUsers.technician.email);
    if (!technician) {
      throw new Error('Missing seeded technician for evidence sync test.');
    }

    const assignedWorkPackageService = new AssignedWorkPackageService(
      new AssignedWorkPackageRepository(pool),
    );
    await assignedWorkPackageService.ensureSeedPackages(technician.id);
    const uploadedKeys = new Set<string>();
    const evidenceSyncService = new EvidenceSyncService(
      new EvidenceSyncRepository(pool),
      createTestEvidenceObjectStorageClient(uploadedKeys),
      () => new Date('2026-04-23T14:30:00.000Z'),
    );

    const runtime = createServiceRuntime({
      serviceName: 'api-service',
      serviceRole: 'api',
      host: '127.0.0.1',
      port: 0,
      verifyDatabaseReadiness: async () => undefined,
      handleRequest: createApiRequestHandler({
        authService,
        assignedWorkPackageService,
        evidenceSyncService,
      }),
    });
    runtimes.push(runtime);

    const { port } = await runtime.start();
    const login = await authService.loginConnected(
      {
        email: authConfig.seedUsers.technician.email,
        password: authConfig.seedUsers.technician.password,
      },
      {
        correlationId: 'corr-evidence-sync-login',
      },
    );

    const metadataResponse = await fetch(`http://127.0.0.1:${port}/sync/evidence-metadata`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${login.tokens.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        reportId: 'tag-report:wp-seed-1001:tag-001',
        workPackageId: 'wp-seed-1001',
        tagId: 'tag-001',
        templateId: 'tpl-pressure-as-found',
        templateVersion: '2026-04-v1',
        evidenceId: 'photo:20260423143000:test',
        fileName: 'field-photo.jpg',
        mimeType: 'image/jpeg',
        executionStepId: 'guidance',
        source: 'camera',
        localCapturedAt: '2026-04-23T14:25:00.000Z',
        metadataIdempotencyKey:
          'upload-evidence-metadata:photo:20260423143000:test:2026-04-23T14:25:00.000Z',
      }),
    });
    const metadataBody = (await metadataResponse.json()) as {
      serverEvidenceId: string;
      presenceStatus: string;
    };

    expect(metadataResponse.status).toBe(200);
    expect(metadataBody.presenceStatus).toBe('metadata-recorded');

    const authorizationResponse = await fetch(
      `http://127.0.0.1:${port}/sync/evidence-upload-authorizations`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${login.tokens.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          reportId: 'tag-report:wp-seed-1001:tag-001',
          evidenceId: 'photo:20260423143000:test',
        }),
      },
    );
    const authorizationBody = (await authorizationResponse.json()) as {
      serverEvidenceId: string;
      objectKey: string;
      uploadMethod: string;
      requiredHeaders: Record<string, string>;
    };

    expect(authorizationResponse.status).toBe(200);
    expect(authorizationBody.serverEvidenceId).toBe(metadataBody.serverEvidenceId);
    expect(authorizationBody.uploadMethod).toBe('PUT');
    expect(authorizationBody.requiredHeaders).toEqual({
      'content-type': 'image/jpeg',
    });

    uploadedKeys.add(authorizationBody.objectKey);

    const finalizationResponse = await fetch(
      `http://127.0.0.1:${port}/sync/evidence-binary-finalizations`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${login.tokens.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          serverEvidenceId: metadataBody.serverEvidenceId,
        }),
      },
    );
    const finalizationBody = (await finalizationResponse.json()) as {
      serverEvidenceId: string;
      presenceStatus: string;
      presenceFinalizedAt: string;
    };

    expect(finalizationResponse.status).toBe(200);
    expect(finalizationBody).toMatchObject({
      serverEvidenceId: metadataBody.serverEvidenceId,
      presenceStatus: 'binary-finalized',
      presenceFinalizedAt: '2026-04-23T14:30:00.000Z',
    });

    await pool.end();
  });
});

function createTestEvidenceObjectStorageClient(
  uploadedKeys: Set<string> = new Set<string>(),
): EvidenceObjectStorageClient {
  return {
    async createBinaryUploadAuthorization(input) {
      return {
        uploadUrl: `https://storage.tagwise.test/${encodeURIComponent(input.objectKey)}`,
        uploadMethod: 'PUT',
        requiredHeaders: {
          'content-type': input.contentType,
        },
        expiresAt: '2026-04-23T14:45:00.000Z',
      };
    },
    async hasObject(objectKey) {
      return uploadedKeys.has(objectKey);
    },
  };
}
