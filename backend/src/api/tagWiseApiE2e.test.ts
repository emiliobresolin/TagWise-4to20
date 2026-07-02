import { afterEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';

import { createApiRequestHandler } from './createApiRequestHandler';
import { AuditEventRepository } from '../modules/audit/auditEventRepository';
import { AuditEventService } from '../modules/audit/auditEventService';
import { AuthRepository } from '../modules/auth/authRepository';
import { AuthService } from '../modules/auth/authService';
import { MobileDiagnosticsRepository } from '../modules/diagnostics/mobileDiagnosticsRepository';
import { MobileDiagnosticsService } from '../modules/diagnostics/mobileDiagnosticsService';
import { MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION } from '../modules/diagnostics/model';
import { EVIDENCE_SYNC_API_CONTRACT_VERSION } from '../modules/evidence-sync/model';
import { EvidenceSyncRepository } from '../modules/evidence-sync/evidenceSyncRepository';
import { EvidenceSyncService } from '../modules/evidence-sync/evidenceSyncService';
import { REPORT_SUBMISSION_API_CONTRACT_VERSION } from '../modules/report-submissions/model';
import { ReportSubmissionRepository } from '../modules/report-submissions/reportSubmissionRepository';
import { ReportSubmissionService } from '../modules/report-submissions/reportSubmissionService';
import { SupervisorReviewRepository } from '../modules/review/supervisorReviewRepository';
import { ManagerReviewService, SupervisorReviewService } from '../modules/review/supervisorReviewService';
import { AssignedWorkPackageRepository } from '../modules/work-packages/assignedWorkPackageRepository';
import { AssignedWorkPackageService } from '../modules/work-packages/assignedWorkPackageService';
import { SupervisorAuthoringService } from '../modules/work-packages/supervisorAuthoringService';
import { InstrumentsRepository } from '../modules/instruments/instrumentsRepository';
import { InstrumentsService } from '../modules/instruments/instrumentsService';
import { runPostgresMigrations } from '../platform/db/migrations';
import { createStructuredLogger } from '../platform/diagnostics/structuredLogger';
import type {
  EvidenceObjectStorageClient,
  EvidenceStoredObjectMetadata,
} from '../platform/storage/objectStorage';
import { createServiceRuntime, type ServiceRuntimeHandle } from '../runtime/serviceRuntime';

const authConfig = {
  tokenSecret: 'e2e-test-secret',
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
    await runtimes.pop()?.stop();
  }
});

describe('TagWise API E2E workflow', () => {
  it('runs a connected technician report through evidence sync, supervisor escalation, and manager approval', async () => {
    const { pool, uploadedObjects, port } = await startApiRuntime();
    const baseUrl = `http://127.0.0.1:${port}`;

    const live = await fetch(`${baseUrl}/health/live`);
    expect(live.status).toBe(200);

    const ready = await fetch(`${baseUrl}/health/ready`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({
      serviceName: 'api-service',
      ready: true,
    });

    const technicianLogin = await postJson<{
      tokens: { accessToken: string };
      user: { id: string; role: string };
    }>(baseUrl, '/auth/login', {
      email: authConfig.seedUsers.technician.email,
      password: authConfig.seedUsers.technician.password,
    }, {
      'x-correlation-id': 'corr-e2e-technician-login',
    });
    expect(technicianLogin.response.status).toBe(200);
    expect(technicianLogin.body.user.role).toBe('technician');

    const technicianAuth = {
      authorization: `Bearer ${technicianLogin.body.tokens.accessToken}`,
    };
    const packages = await getJson<{
      items: Array<{ id: string; tagCount: number; snapshotContractVersion: string }>;
    }>(baseUrl, '/work-packages', technicianAuth);
    expect(packages.response.status).toBe(200);
    expect(packages.body.items.length).toBeGreaterThan(0);

    const workPackageId = packages.body.items[0]?.id;
    if (!workPackageId) {
      throw new Error('Expected at least one seeded work package.');
    }

    const snapshotResponse = await getJson<{
      contractVersion: string;
      summary: { id: string; snapshotContractVersion: string };
      tags: Array<{ id: string; templateIds: string[] }>;
      templates: Array<{
        id: string;
        minimumSubmissionEvidence: string[];
      }>;
    }>(baseUrl, `/work-packages/${encodeURIComponent(workPackageId)}/download`, technicianAuth);
    expect(snapshotResponse.response.status).toBe(200);
    expect(snapshotResponse.body.contractVersion).toBe('2026-04-v1');

    const tag = snapshotResponse.body.tags.find((item) => item.templateIds.length > 0);
    const template = tag
      ? snapshotResponse.body.templates.find((item) => tag.templateIds.includes(item.id))
      : undefined;
    if (!tag || !template) {
      throw new Error('Expected the seeded package to include a tag/template pair.');
    }

    const diagnostics = await postJson<{
      id: string;
      contractVersion: string;
      reportingUserId: string;
    }>(baseUrl, '/diagnostics/mobile-errors', buildMobileDiagnosticsPayload({
      id: 'mobile-error-e2e-001',
      sessionUserId: technicianLogin.body.user.id,
    }), {
      ...technicianAuth,
      'x-correlation-id': 'corr-e2e-mobile-diagnostics',
    });
    expect(diagnostics.response.status).toBe(200);
    expect(diagnostics.body).toMatchObject({
      contractVersion: MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
      id: 'mobile-error-e2e-001',
      reportingUserId: technicianLogin.body.user.id,
    });

    const reportId = `tag-report:${workPackageId}:${tag.id}:e2e`;
    const evidenceId = `photo:e2e:${tag.id}`;
    const metadata = await postJson<{
      serverEvidenceId: string;
      objectKey: string;
      presenceStatus: string;
    }>(baseUrl, '/sync/evidence-metadata', {
      contractVersion: EVIDENCE_SYNC_API_CONTRACT_VERSION,
      reportId,
      workPackageId,
      tagId: tag.id,
      templateId: template.id,
      templateVersion: snapshotResponse.body.contractVersion,
      evidenceId,
      fileName: 'field-e2e-photo.jpg',
      mimeType: 'image/jpeg',
      fileSizeBytes: 2048,
      executionStepId: 'guidance',
      source: 'camera',
      localCapturedAt: '2026-04-23T14:25:00.000Z',
      metadataIdempotencyKey: `metadata:${reportId}:${evidenceId}`,
    }, technicianAuth);
    expect(metadata.response.status).toBe(200);
    expect(metadata.body.presenceStatus).toBe('metadata-recorded');

    const uploadAuthorization = await postJson<{
      serverEvidenceId: string;
      objectKey: string;
      uploadMethod: string;
    }>(baseUrl, '/sync/evidence-upload-authorizations', {
      contractVersion: EVIDENCE_SYNC_API_CONTRACT_VERSION,
      reportId,
      evidenceId,
    }, technicianAuth);
    expect(uploadAuthorization.response.status).toBe(200);
    expect(uploadAuthorization.body).toMatchObject({
      serverEvidenceId: metadata.body.serverEvidenceId,
      uploadMethod: 'PUT',
    });

    uploadedObjects.set(uploadAuthorization.body.objectKey, {
      contentLengthBytes: 2048,
      contentType: 'image/jpeg',
    });

    const finalizedEvidence = await postJson<{
      serverEvidenceId: string;
      presenceFinalizedAt: string;
      presenceStatus: string;
    }>(baseUrl, '/sync/evidence-binary-finalizations', {
      contractVersion: EVIDENCE_SYNC_API_CONTRACT_VERSION,
      serverEvidenceId: metadata.body.serverEvidenceId,
    }, technicianAuth);
    expect(finalizedEvidence.response.status).toBe(200);
    expect(finalizedEvidence.body).toMatchObject({
      serverEvidenceId: metadata.body.serverEvidenceId,
      presenceFinalizedAt: '2026-04-23T14:30:00.000Z',
      presenceStatus: 'binary-finalized',
    });

    const reportSubmission = await postJson<{
      reportId: string;
      lifecycleState: string;
      syncState: string;
    }>(baseUrl, '/sync/report-submissions', buildReportSubmissionPayload({
      reportId,
      workPackageId,
      tagId: tag.id,
      templateId: template.id,
      templateVersion: snapshotResponse.body.contractVersion,
      minimumEvidenceLabels: template.minimumSubmissionEvidence,
      photoAttachment: {
        evidenceId,
        serverEvidenceId: metadata.body.serverEvidenceId,
        presenceFinalizedAt: finalizedEvidence.body.presenceFinalizedAt,
      },
    }), technicianAuth);
    expect(reportSubmission.response.status).toBe(200);
    expect(reportSubmission.body).toMatchObject({
      reportId,
      lifecycleState: 'Submitted - Pending Supervisor Review',
      syncState: 'synced',
    });

    const supervisorLogin = await postJson<{
      tokens: { accessToken: string };
      user: { role: string };
    }>(baseUrl, '/auth/login', {
      email: authConfig.seedUsers.supervisor.email,
      password: authConfig.seedUsers.supervisor.password,
    });
    expect(supervisorLogin.body.user.role).toBe('supervisor');
    const supervisorAuth = {
      authorization: `Bearer ${supervisorLogin.body.tokens.accessToken}`,
    };

    const supervisorQueue = await getJson<{
      items: Array<{ reportId: string; lifecycleState: string }>;
    }>(baseUrl, '/review/supervisor/reports', supervisorAuth);
    expect(supervisorQueue.response.status).toBe(200);
    expect(supervisorQueue.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reportId,
          lifecycleState: 'Submitted - Pending Supervisor Review',
        }),
      ]),
    );

    const escalation = await postJson<{
      reportId: string;
      decisionType: string;
      lifecycleState: string;
      managerReviewerUserId: string;
    }>(baseUrl, `/review/supervisor/reports/${encodeURIComponent(reportId)}/escalate`, {
      rationale: 'Higher-risk signal requires manager approval.',
    }, {
      ...supervisorAuth,
      'x-correlation-id': 'corr-e2e-supervisor-escalate',
    });
    expect(escalation.response.status).toBe(200);
    expect(escalation.body).toMatchObject({
      reportId,
      decisionType: 'escalated',
      lifecycleState: 'Escalated - Pending Manager Review',
    });

    const managerLogin = await postJson<{
      tokens: { accessToken: string };
      user: { role: string };
    }>(baseUrl, '/auth/login', {
      email: authConfig.seedUsers.manager.email,
      password: authConfig.seedUsers.manager.password,
    });
    expect(managerLogin.body.user.role).toBe('manager');
    const managerAuth = {
      authorization: `Bearer ${managerLogin.body.tokens.accessToken}`,
    };

    const managerQueue = await getJson<{
      items: Array<{ reportId: string; lifecycleState: string }>;
    }>(baseUrl, '/review/manager/reports', managerAuth);
    expect(managerQueue.response.status).toBe(200);
    expect(managerQueue.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reportId,
          lifecycleState: 'Escalated - Pending Manager Review',
        }),
      ]),
    );

    const approval = await postJson<{
      reportId: string;
      decisionType: string;
      lifecycleState: string;
    }>(baseUrl, `/review/manager/reports/${encodeURIComponent(reportId)}/approve`, {}, {
      ...managerAuth,
      'x-correlation-id': 'corr-e2e-manager-approve',
    });
    expect(approval.response.status).toBe(200);
    expect(approval.body).toMatchObject({
      reportId,
      decisionType: 'approved',
      lifecycleState: 'Approved',
    });

    const storedReport = (await pool.query(
      `
        SELECT report_state, lifecycle_state, sync_state
        FROM report_submission_records
        WHERE report_id = $1;
      `,
      [reportId],
    )) as {
      rows: Array<{
        report_state: string;
        lifecycle_state: string;
        sync_state: string;
      }>;
    };
    expect(storedReport.rows[0]).toEqual({
      report_state: 'approved',
      lifecycle_state: 'Approved',
      sync_state: 'synced',
    });

    const storedEvidence = (await pool.query(
      `
        SELECT presence_status, file_size_bytes
        FROM evidence_sync_records
        WHERE server_evidence_id = $1;
      `,
      [metadata.body.serverEvidenceId],
    )) as {
      rows: Array<{
        presence_status: string;
        file_size_bytes: number;
      }>;
    };
    expect(storedEvidence.rows[0]).toEqual({
      presence_status: 'binary-finalized',
      file_size_bytes: 2048,
    });

    const auditEvents = (await pool.query(
      `
        SELECT action_type, correlation_id
        FROM audit_events
        WHERE target_object_type = 'report' AND target_object_id = $1
        ORDER BY occurred_at ASC;
      `,
      [reportId],
    )) as {
      rows: Array<{
        action_type: string;
        correlation_id: string;
      }>;
    };
    expect(auditEvents.rows).toEqual([
      {
        action_type: 'report.supervisor.escalated',
        correlation_id: 'corr-e2e-supervisor-escalate',
      },
      {
        action_type: 'report.manager.approved',
        correlation_id: 'corr-e2e-manager-approve',
      },
    ]);

    await pool.end();
  });

  // Story 9.5: cross-cutting smoke - supervisor authors a package, technician
  // sees and downloads it through the existing /work-packages flow.
  it('lets a supervisor compose a work package from the instruments catalog and the assigned technician download it', async () => {
    const { port } = await startApiRuntime();
    const baseUrl = `http://127.0.0.1:${port}`;

    const supervisorLogin = await postJson<{ tokens: { accessToken: string } }>(
      baseUrl,
      '/auth/login',
      {
        email: authConfig.seedUsers.supervisor.email,
        password: authConfig.seedUsers.supervisor.password,
      },
    );
    expect(supervisorLogin.response.status).toBe(200);
    const supervisorAuth = {
      authorization: `Bearer ${supervisorLogin.body.tokens.accessToken}`,
    };

    const technicianLogin = await postJson<{
      tokens: { accessToken: string };
    }>(baseUrl, '/auth/login', {
      email: authConfig.seedUsers.technician.email,
      password: authConfig.seedUsers.technician.password,
    });
    expect(technicianLogin.response.status).toBe(200);
    const technicianAuth = {
      authorization: `Bearer ${technicianLogin.body.tokens.accessToken}`,
    };

    const instruments = await getJson<{
      items: Array<{ id: string; tagCode: string; instrumentFamily: string }>;
    }>(baseUrl, '/supervisor/instruments', supervisorAuth);
    expect(instruments.response.status).toBe(200);
    expect(instruments.body.items.length).toBe(20);

    const technicianListed = await getJson<{
      items: Array<{ id: string; email: string }>;
    }>(baseUrl, '/supervisor/technicians', supervisorAuth);
    expect(technicianListed.response.status).toBe(200);
    const techRecord = technicianListed.body.items.find(
      (item) => item.email === authConfig.seedUsers.technician.email,
    );
    expect(techRecord).toBeDefined();

    // Technician cannot reach the supervisor catalog.
    const forbidden = await getJson(baseUrl, '/supervisor/instruments', technicianAuth);
    expect(forbidden.response.status).toBe(403);

    const pickedInstruments = instruments.body.items.slice(0, 2);
    const createResponse = await postJson<{
      summary: { id: string; tagCount: number; title: string };
      tags: Array<{ tagCode: string; templateIds: string[] }>;
      templates: Array<{ id: string }>;
    }>(baseUrl, '/supervisor/work-packages', {
      title: 'Smoke - autoria do supervisor',
      assignedTeam: 'Instrumentation Smoke',
      priority: 'routine',
      dueWindow: {
        startsAt: '2026-05-20T08:00:00.000Z',
        endsAt: '2026-05-20T17:00:00.000Z',
      },
      assignedUserId: techRecord!.id,
      instrumentIds: pickedInstruments.map((instrument) => instrument.id),
    }, supervisorAuth);

    expect(createResponse.response.status).toBe(201);
    const newPackageId = createResponse.body.summary.id;
    expect(newPackageId.startsWith('pkg-sup-')).toBe(true);
    expect(createResponse.body.summary.tagCount).toBe(2);
    expect(createResponse.body.tags.map((tag) => tag.tagCode).sort()).toEqual(
      pickedInstruments.map((instrument) => instrument.tagCode).sort(),
    );
    expect(createResponse.body.templates.length).toBeGreaterThan(0);

    const technicianPackages = await getJson<{
      items: Array<{ id: string; tagCount: number }>;
    }>(baseUrl, '/work-packages', technicianAuth);
    expect(technicianPackages.response.status).toBe(200);
    expect(
      technicianPackages.body.items.some((item) => item.id === newPackageId),
    ).toBe(true);

    const downloaded = await getJson<{
      contractVersion: string;
      summary: { id: string; tagCount: number };
      tags: Array<{ id: string; tagCode: string; templateIds: string[] }>;
      templates: Array<{ id: string; minimumSubmissionEvidence: string[] }>;
    }>(baseUrl, `/work-packages/${encodeURIComponent(newPackageId)}/download`, technicianAuth);
    expect(downloaded.response.status).toBe(200);
    expect(downloaded.body.summary.id).toBe(newPackageId);
    expect(downloaded.body.tags.length).toBe(2);

    // Regression (review-route gap): a report submitted against the freshly
    // authored package must reach the supervisor review queue immediately —
    // review reads INNER JOIN supervisor_review_routes, and boot-time
    // ensureSeedRoutes cannot cover packages authored after startup.
    const authoredTag = downloaded.body.tags.find((item) => item.templateIds.length > 0);
    const authoredTemplate = authoredTag
      ? downloaded.body.templates.find((item) => authoredTag.templateIds.includes(item.id))
      : undefined;
    if (!authoredTag || !authoredTemplate) {
      throw new Error('Expected the authored package to include a tag/template pair.');
    }

    const authoredReportId = `tag-report:${newPackageId}:${authoredTag.id}:e2e`;
    const authoredSubmission = await postJson<{
      reportId: string;
      lifecycleState: string;
    }>(baseUrl, '/sync/report-submissions', buildReportSubmissionPayload({
      reportId: authoredReportId,
      workPackageId: newPackageId,
      tagId: authoredTag.id,
      templateId: authoredTemplate.id,
      templateVersion: downloaded.body.contractVersion,
      minimumEvidenceLabels: authoredTemplate.minimumSubmissionEvidence,
    }), technicianAuth);
    expect(authoredSubmission.response.status).toBe(200);
    expect(authoredSubmission.body).toMatchObject({
      reportId: authoredReportId,
      lifecycleState: 'Submitted - Pending Supervisor Review',
    });

    const supervisorQueue = await getJson<{
      items: Array<{ reportId: string; workPackageId: string; lifecycleState: string }>;
    }>(baseUrl, '/review/supervisor/reports', supervisorAuth);
    expect(supervisorQueue.response.status).toBe(200);
    expect(supervisorQueue.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reportId: authoredReportId,
          workPackageId: newPackageId,
          lifecycleState: 'Submitted - Pending Supervisor Review',
        }),
      ]),
    );

    const supervisorDetail = await getJson<{
      report: { reportId: string };
    }>(
      baseUrl,
      `/review/supervisor/reports/${encodeURIComponent(authoredReportId)}`,
      supervisorAuth,
    );
    expect(supervisorDetail.response.status).toBe(200);
    expect(supervisorDetail.body.report.reportId).toBe(authoredReportId);
  });

  it('rejects unauthenticated access and malformed report submissions over HTTP', async () => {
    const { port, pool } = await startApiRuntime();
    const baseUrl = `http://127.0.0.1:${port}`;

    const unauthenticatedPackages = await fetch(`${baseUrl}/work-packages`);
    expect(unauthenticatedPackages.status).toBe(401);
    expect(await unauthenticatedPackages.json()).toEqual({
      message: 'Authorization header is required.',
    });

    const login = await postJson<{ tokens: { accessToken: string } }>(baseUrl, '/auth/login', {
      email: authConfig.seedUsers.technician.email,
      password: authConfig.seedUsers.technician.password,
    });
    const invalidSubmission = await postJson<{ message: string; syncIssue: { reasonCode: string } }>(
      baseUrl,
      '/sync/report-submissions',
      {
        contractVersion: REPORT_SUBMISSION_API_CONTRACT_VERSION,
        reportId: '',
      },
      {
        authorization: `Bearer ${login.body.tokens.accessToken}`,
      },
    );
    expect(invalidSubmission.response.status).toBe(422);
    expect(invalidSubmission.body).toMatchObject({
      message: 'Report submission evidenceReferences must be an array.',
      syncIssue: {
        reasonCode: 'malformed-report-payload',
      },
    });

    await pool.end();
  });
});

async function startApiRuntime() {
  const database = newDb();
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();
  await runPostgresMigrations(pool);

  const authRepository = new AuthRepository(pool);
  const auditRepository = new AuditEventRepository(pool);
  const authService = new AuthService(
    authRepository,
    authConfig,
    new AuditEventService(auditRepository),
  );
  await authService.ensureSeedUsers();

  const technician = await authRepository.findByEmail(authConfig.seedUsers.technician.email);
  const supervisor = await authRepository.findByEmail(authConfig.seedUsers.supervisor.email);
  const manager = await authRepository.findByEmail(authConfig.seedUsers.manager.email);
  if (!technician || !supervisor || !manager) {
    throw new Error('Expected seeded users to exist after auth bootstrap.');
  }

  const assignedWorkPackageRepository = new AssignedWorkPackageRepository(pool);
  const assignedWorkPackageService = new AssignedWorkPackageService(
    assignedWorkPackageRepository,
  );
  await assignedWorkPackageService.ensureSeedPackages(technician.id);
  const seededWorkPackages = await assignedWorkPackageService.listAssignedPackages(technician);
  // Story 9.1 / 9.3: instruments catalog + supervisor authoring service.
  const instrumentsService = new InstrumentsService(new InstrumentsRepository(pool));
  await instrumentsService.ensureSeedInstruments();
  const supervisorAuthoringService = new SupervisorAuthoringService(
    instrumentsService,
    authRepository,
    assignedWorkPackageRepository,
  );

  const uploadedObjects = new Map<string, EvidenceStoredObjectMetadata>();
  const evidenceSyncService = new EvidenceSyncService(
    new EvidenceSyncRepository(pool),
    createTestEvidenceObjectStorageClient(uploadedObjects),
    () => new Date('2026-04-23T14:30:00.000Z'),
  );
  const reportSubmissionService = new ReportSubmissionService(
    new ReportSubmissionRepository(pool),
    assignedWorkPackageService,
    () => new Date('2026-04-23T14:35:00.000Z'),
  );
  const reviewRepository = new SupervisorReviewRepository(pool);
  const supervisorReviewService = new SupervisorReviewService(
    reviewRepository,
    () => new Date('2026-04-23T14:40:00.000Z'),
    manager.id,
  );
  await supervisorReviewService.ensureSeedRoutes(
    supervisor.id,
    seededWorkPackages.map((workPackage) => workPackage.id),
  );

  const runtime = createServiceRuntime({
    serviceName: 'api-service',
    serviceRole: 'api',
    host: '127.0.0.1',
    port: 0,
    verifyDatabaseReadiness: async () => undefined,
    logger: createStructuredLogger(
      {
        serviceName: 'api-service',
        serviceRole: 'api',
      },
      () => undefined,
    ),
    handleRequest: createApiRequestHandler({
      authService,
      authRepository,
      assignedWorkPackageService,
      instrumentsService,
      supervisorAuthoringService,
      evidenceSyncService,
      mobileDiagnosticsService: new MobileDiagnosticsService(
        new MobileDiagnosticsRepository(pool),
      ),
      managerReviewService: new ManagerReviewService(
        reviewRepository,
        () => new Date('2026-04-23T14:45:00.000Z'),
      ),
      reportSubmissionService,
      supervisorReviewService,
    }),
  });
  runtimes.push(runtime);

  const { port } = await runtime.start();
  return { authService, pool, port, uploadedObjects };
}

function createTestEvidenceObjectStorageClient(
  uploadedObjects: Map<string, EvidenceStoredObjectMetadata>,
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
    async createBinaryAccessAuthorization(input) {
      return {
        downloadUrl: `https://storage.tagwise.test/${encodeURIComponent(input.objectKey)}`,
        downloadMethod: 'GET',
        requiredHeaders: {},
        expiresAt: '2026-04-23T14:45:00.000Z',
      };
    },
    async getObjectMetadata(objectKey) {
      return uploadedObjects.get(objectKey) ?? null;
    },
  };
}

async function getJson<T>(
  baseUrl: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ response: Response; body: T }> {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  return {
    response,
    body: (await response.json()) as T,
  };
}

async function postJson<T>(
  baseUrl: string,
  path: string,
  payload: unknown,
  headers: Record<string, string> = {},
): Promise<{ response: Response; body: T }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  return {
    response,
    body: (await response.json()) as T,
  };
}

function buildMobileDiagnosticsPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    contractVersion: MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
    id: 'mobile-error-e2e-001',
    severity: 'error',
    errorName: 'Error',
    message: 'Forced E2E mobile diagnostics capture',
    stack: 'Error: Forced E2E mobile diagnostics capture',
    capturedAt: '2026-04-23T14:20:00.000Z',
    sessionUserId: 'user-tech',
    sessionRole: 'technician',
    sessionConnectionMode: 'connected',
    shellRoute: 'packages',
    devicePlatform: 'android',
    devicePlatformVersion: '34',
    appEnvironment: 'test',
    apiBaseUrl: 'http://127.0.0.1:4100',
    contextJson: JSON.stringify({ source: 'tagwise-api-e2e' }),
    ...overrides,
  };
}

function buildReportSubmissionPayload(input: {
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  minimumEvidenceLabels: string[];
  photoAttachment?: {
    evidenceId: string;
    serverEvidenceId: string;
    presenceFinalizedAt: string;
  };
}): Record<string, unknown> {
  return {
    contractVersion: REPORT_SUBMISSION_API_CONTRACT_VERSION,
    reportId: input.reportId,
    workPackageId: input.workPackageId,
    tagId: input.tagId,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    reportState: 'submitted-pending-sync',
    lifecycleState: 'Submitted - Pending Sync',
    syncState: 'pending-validation',
    objectVersion: '2026-04-23T14:36:00.000Z',
    idempotencyKey: `submit-report:${input.reportId}:2026-04-23T14:36:00.000Z`,
    submittedAt: '2026-04-23T14:34:00.000Z',
    executionSummary: `Structured execution has been completed for ${input.tagId}.`,
    historySummary: 'History was reviewed against the cached package snapshot.',
    draftDiagnosisSummary: 'Local guided diagnosis suggests manager review for the flagged condition.',
    evidenceReferences: [
      ...input.minimumEvidenceLabels.map((label, index) => ({
        label,
        requirementLevel: 'minimum',
        evidenceKind: index === 0 ? 'structured-readings' : 'observation-notes',
        satisfied: true,
        detail: `${label} captured during the E2E workflow.`,
      })),
      ...(input.photoAttachment
        ? [
            {
              label: 'supporting photo',
              requirementLevel: 'expected',
              evidenceKind: 'photo-evidence',
              satisfied: true,
              detail: 'Photo evidence was finalized in object storage before report submission.',
            },
          ]
        : []),
    ],
    riskFlags: [
      {
        id: 'e2e-high-risk-review',
        reasonType: 'higher-risk-signal',
        justificationRequired: true,
        justificationText: 'Escalated because the guided diagnosis found a higher-risk signal.',
      },
    ],
    photoAttachments: input.photoAttachment
      ? [
          {
            evidenceId: input.photoAttachment.evidenceId,
            serverEvidenceId: input.photoAttachment.serverEvidenceId,
            presenceFinalizedAt: input.photoAttachment.presenceFinalizedAt,
            syncState: 'synced',
          },
        ]
      : [],
  };
}
