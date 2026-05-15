import { describe, expect, it, vi } from 'vitest';

import type { AssignedWorkPackageService } from '../work-packages/assignedWorkPackageService';
import type { ReportSubmissionRepository } from '../report-submissions/reportSubmissionRepository';
import type { WorkerJobRepository } from '../worker-jobs/workerJobRepository';
import { AiDiagnosisRepository } from './aiDiagnosisRepository';
import {
  AI_DIAGNOSIS_JOB_TYPE,
  AiDiagnosisService,
  buildAiDiagnosisJobIdempotencyKey,
} from './aiDiagnosisService';
import { createAiDiagnosisJobHandler } from './aiDiagnosisJobHandler';
import { MockAiDiagnosisProvider } from './mockAiDiagnosisProvider';
import type { AiDiagnosisProvider } from './aiDiagnosisProvider';
import {
  AiDiagnosisProviderError,
  type AiDiagnosisRecord,
  type AiDiagnosisResult,
} from './model';

const technicianUser = {
  id: 'user-tech-1',
  role: 'technician' as const,
  email: 'tech@tagwise.local',
  displayName: 'Tecnico',
};

const sampleReportRecord = {
  ownerUserId: technicianUser.id,
  reportId: 'tag-report:wp-seed-1001:tag-pt-101',
  workPackageId: 'wp-seed-1001',
  tagId: 'tag-pt-101',
  templateId: 'tpl-pressure-as-found',
  templateVersion: '2026-04-v1',
  localObjectVersion: 'v1',
  idempotencyKey: 'idem-1',
  serverReportVersion: 'srv-v1',
  reportState: 'submitted-pending-review' as const,
  lifecycleState: 'Submitted - Pending Supervisor Review' as const,
  syncState: 'synced' as const,
  submittedAt: '2026-05-14T12:00:00.000Z',
  acceptedAt: '2026-05-14T12:01:00.000Z',
  createdAt: '2026-05-14T12:01:00.000Z',
  updatedAt: '2026-05-14T12:01:00.000Z',
  payloadJson: {
    contractVersion: '2026-04-v1',
    reportId: 'tag-report:wp-seed-1001:tag-pt-101',
    workPackageId: 'wp-seed-1001',
    tagId: 'tag-pt-101',
    templateId: 'tpl-pressure-as-found',
    templateVersion: '2026-04-v1',
    reportState: 'submitted-pending-sync',
    lifecycleState: 'Submitted - Pending Sync',
    syncState: 'pending-validation',
    objectVersion: 'v1',
    idempotencyKey: 'idem-1',
    submittedAt: '2026-05-14T12:00:00.000Z',
    executionSummary:
      'Pressao as-found: medido 7,62 bar @ 75% vs esperado 7,50 bar; deriva +0,12 bar dentro de tolerancia.',
    historySummary: 'Ultima calibracao aprovada com observacao em 2026-03-14.',
    draftDiagnosisSummary: 'Acompanhar tendencia de deriva positiva na meia escala.',
    evidenceReferences: [
      {
        label: 'as-found readings',
        requirementLevel: 'minimum' as const,
        evidenceKind: 'structured-readings' as const,
        satisfied: true,
        detail: 'Structured readings captured locally.',
      },
    ],
    riskFlags: [
      {
        id: 'risk-history-drift',
        reasonType: 'historical-recurrence',
        justificationRequired: true,
        justificationText: 'Deriva positiva persistente acima da meia escala.',
      },
    ],
    photoAttachments: [
      {
        evidenceId: 'photo-1',
        serverEvidenceId: 'srv-photo-1',
        presenceFinalizedAt: '2026-05-14T12:00:30.000Z',
        syncState: 'synced' as const,
      },
    ],
  },
};

function buildPackageSnapshot() {
  return {
    contractVersion: '2026-04-v1',
    generatedAt: '2026-04-19T10:00:00.000Z',
    summary: { id: 'wp-seed-1001' },
    tags: [
      {
        id: 'tag-pt-101',
        tagCode: 'PT-101',
        instrumentFamily: 'pressure transmitter',
        templateIds: ['tpl-pressure-as-found'],
      },
    ],
    templates: [{ id: 'tpl-pressure-as-found' }],
    guidance: [],
    historySummaries: [],
  } as unknown;
}

describe('AiDiagnosisService', () => {
  // Story 8.9 D-01 — the request-for-report path must upsert a pending row
  // AND enqueue a worker job in lockstep. Anything that skips either side
  // breaks the assistive promise the user authorized.
  it('upserts a pending row and enqueues a worker job carrying the derived AI input', async () => {
    const upsertPending = vi.fn(
      async (): Promise<AiDiagnosisRecord> => ({
        ownerUserId: technicianUser.id,
        reportId: sampleReportRecord.reportId,
        state: 'pending',
        result: null,
        providerLabel: null,
        summary: null,
        detail: null,
        failureReason: null,
        lastRequestedAt: '2026-05-14T12:05:00.000Z',
        lastRequestSource: 'manual',
        generatedAt: null,
        createdAt: '2026-05-14T12:05:00.000Z',
        updatedAt: '2026-05-14T12:05:00.000Z',
      }),
    );
    const enqueue = vi.fn(async () => ({
      id: 'worker-job:test',
      jobType: AI_DIAGNOSIS_JOB_TYPE,
      idempotencyKey: 'idem-key',
      status: 'queued' as const,
      payloadJson: {},
      attemptCount: 0,
      maxAttempts: 3,
      availableAt: '2026-05-14T12:05:00.000Z',
      lockedBy: null,
      lockedAt: null,
      lastError: null,
      lastStartedAt: null,
      completedAt: null,
      createdAt: '2026-05-14T12:05:00.000Z',
      updatedAt: '2026-05-14T12:05:00.000Z',
    }));
    const getByReportId = vi.fn(async () => sampleReportRecord);
    const downloadAssignedPackage = vi.fn(async () => buildPackageSnapshot());

    const service = new AiDiagnosisService(
      { upsertPending } as unknown as AiDiagnosisRepository,
      { enqueue } as unknown as WorkerJobRepository,
      { getByReportId } as unknown as ReportSubmissionRepository,
      { downloadAssignedPackage } as unknown as AssignedWorkPackageService,
      () => new Date('2026-05-14T12:05:00.000Z'),
    );

    const result = await service.requestForReport({
      user: technicianUser,
      reportId: sampleReportRecord.reportId,
      requestSource: 'manual',
    });

    expect(result.state).toBe('pending');
    expect(upsertPending).toHaveBeenCalledWith({
      ownerUserId: technicianUser.id,
      reportId: sampleReportRecord.reportId,
      requestSource: 'manual',
      requestedAt: '2026-05-14T12:05:00.000Z',
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
    const enqueueArg = (enqueue.mock.calls[0] as unknown as [
      {
        jobType: string;
        idempotencyKey: string;
        payloadJson: Record<string, unknown>;
      },
    ])[0];
    expect(enqueueArg.jobType).toBe(AI_DIAGNOSIS_JOB_TYPE);
    expect(enqueueArg.idempotencyKey).toBe(
      buildAiDiagnosisJobIdempotencyKey({
        ownerUserId: technicianUser.id,
        reportId: sampleReportRecord.reportId,
        requestedAt: '2026-05-14T12:05:00.000Z',
      }),
    );
    expect(enqueueArg.payloadJson).toMatchObject({
      ownerUserId: technicianUser.id,
      reportId: sampleReportRecord.reportId,
      requestSource: 'manual',
      input: {
        tagCode: 'PT-101',
        instrumentFamily: 'pressure transmitter',
        templateId: 'tpl-pressure-as-found',
        deterministicResultSummary: expect.stringContaining('Pressao'),
        riskFlags: [
          expect.objectContaining({
            id: 'risk-history-drift',
            reasonType: 'historical-recurrence',
          }),
        ],
      },
    });
  });

  it('does NOT enqueue a worker job when the report already has an available AI result', async () => {
    const upsertPending = vi.fn(
      async (): Promise<AiDiagnosisRecord> => ({
        ownerUserId: technicianUser.id,
        reportId: sampleReportRecord.reportId,
        state: 'available',
        result: null,
        providerLabel: 'mock (mock-ai-diagnosis-v1)',
        summary: 'Existing assistive diagnosis from a prior run.',
        detail: 'Padroes provaveis: ...',
        failureReason: null,
        lastRequestedAt: '2026-05-14T11:00:00.000Z',
        lastRequestSource: 'auto-on-submit',
        generatedAt: '2026-05-14T11:00:30.000Z',
        createdAt: '2026-05-14T11:00:00.000Z',
        updatedAt: '2026-05-14T11:00:30.000Z',
      }),
    );
    const enqueue = vi.fn();

    const service = new AiDiagnosisService(
      { upsertPending } as unknown as AiDiagnosisRepository,
      { enqueue } as unknown as WorkerJobRepository,
      { getByReportId: async () => sampleReportRecord } as unknown as ReportSubmissionRepository,
      {
        downloadAssignedPackage: async () => buildPackageSnapshot(),
      } as unknown as AssignedWorkPackageService,
      () => new Date('2026-05-14T12:05:00.000Z'),
    );

    const result = await service.requestForReport({
      user: technicianUser,
      reportId: sampleReportRecord.reportId,
      requestSource: 'manual',
    });

    expect(result.state).toBe('available');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects with 404 when the report is not found for the requesting technician', async () => {
    const service = new AiDiagnosisService(
      {} as AiDiagnosisRepository,
      {} as WorkerJobRepository,
      { getByReportId: async () => null } as unknown as ReportSubmissionRepository,
      {} as AssignedWorkPackageService,
    );

    await expect(
      service.requestForReport({
        user: technicianUser,
        reportId: 'unknown-report',
        requestSource: 'manual',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('AiDiagnosisJobHandler', () => {
  // Story 8.9 D-01 — handler must persist 'available' on provider success
  // and 'failed-nonblocking' on provider error (then re-throw so the
  // worker retries within its budget).
  it('marks the diagnosis row available after a successful provider call', async () => {
    const markAvailable = vi.fn(async () => undefined);
    const markFailedNonblocking = vi.fn(async () => undefined);
    const repository = {
      markAvailable,
      markFailedNonblocking,
    } as unknown as AiDiagnosisRepository;

    const provider: AiDiagnosisProvider = new MockAiDiagnosisProvider(
      () => new Date('2026-05-14T12:06:00.000Z'),
    );
    const handler = createAiDiagnosisJobHandler({
      repository,
      provider,
      now: () => new Date('2026-05-14T12:06:01.000Z'),
    });

    await handler.handle({
      id: 'worker-job:test',
      jobType: AI_DIAGNOSIS_JOB_TYPE,
      idempotencyKey: 'idem',
      status: 'running',
      payloadJson: {
        ownerUserId: technicianUser.id,
        reportId: sampleReportRecord.reportId,
        requestSource: 'manual',
        input: {
          tagCode: 'PT-101',
          instrumentFamily: 'pressure transmitter',
          templateId: 'tpl-pressure-as-found',
          deterministicResultSummary: 'OK',
          historySummary: 'OK',
          riskFlags: [],
          evidenceSummary: '1 photo attachment linked locally.',
        },
      },
      attemptCount: 1,
      maxAttempts: 3,
      availableAt: '2026-05-14T12:05:00.000Z',
      lockedBy: 'worker:test',
      lockedAt: '2026-05-14T12:06:00.000Z',
      lastError: null,
      lastStartedAt: '2026-05-14T12:06:00.000Z',
      completedAt: null,
      createdAt: '2026-05-14T12:05:00.000Z',
      updatedAt: '2026-05-14T12:06:00.000Z',
    });

    expect(markAvailable).toHaveBeenCalledTimes(1);
    expect(markFailedNonblocking).not.toHaveBeenCalled();
    const arg = (markAvailable.mock.calls[0] as unknown as [
      {
        ownerUserId: string;
        reportId: string;
        result: AiDiagnosisResult;
        providerLabel: string;
        summary: string;
        detail: string;
        generatedAt: string;
      },
    ])[0];
    expect(arg.ownerUserId).toBe(technicianUser.id);
    expect(arg.reportId).toBe(sampleReportRecord.reportId);
    expect(arg.providerLabel).toBe('mock (mock-ai-diagnosis-v1)');
    expect(arg.summary).toMatch(/Mock assistive diagnosis for PT-101/);
    expect(arg.detail).toMatch(/Padroes provaveis|Sugestoes de verificacao/);
    expect(arg.generatedAt).toBe('2026-05-14T12:06:00.000Z');
  });

  it('marks the row failed-nonblocking and re-throws when the provider errors', async () => {
    const markAvailable = vi.fn();
    const markFailedNonblocking = vi.fn(async () => undefined);
    const repository = {
      markAvailable,
      markFailedNonblocking,
    } as unknown as AiDiagnosisRepository;

    const failingProvider: AiDiagnosisProvider = {
      async generateDiagnosis() {
        throw new AiDiagnosisProviderError('Provider rate limit exceeded.');
      },
    };
    const handler = createAiDiagnosisJobHandler({
      repository,
      provider: failingProvider,
      now: () => new Date('2026-05-14T12:06:05.000Z'),
    });

    await expect(
      handler.handle({
        id: 'worker-job:test',
        jobType: AI_DIAGNOSIS_JOB_TYPE,
        idempotencyKey: 'idem',
        status: 'running',
        payloadJson: {
          ownerUserId: technicianUser.id,
          reportId: sampleReportRecord.reportId,
          requestSource: 'manual',
          input: {
            tagCode: 'PT-101',
            instrumentFamily: 'pressure transmitter',
            templateId: 'tpl-pressure-as-found',
            deterministicResultSummary: 'OK',
            historySummary: 'OK',
            riskFlags: [],
            evidenceSummary: '',
          },
        },
        attemptCount: 1,
        maxAttempts: 3,
        availableAt: '2026-05-14T12:05:00.000Z',
        lockedBy: 'worker:test',
        lockedAt: '2026-05-14T12:06:00.000Z',
        lastError: null,
        lastStartedAt: '2026-05-14T12:06:00.000Z',
        completedAt: null,
        createdAt: '2026-05-14T12:05:00.000Z',
        updatedAt: '2026-05-14T12:06:00.000Z',
      }),
    ).rejects.toThrow('Provider rate limit exceeded.');

    expect(markFailedNonblocking).toHaveBeenCalledTimes(1);
    expect(markAvailable).not.toHaveBeenCalled();
    const failedArg = (markFailedNonblocking.mock.calls[0] as unknown as [
      { ownerUserId: string; reportId: string; failureReason: string },
    ])[0];
    expect(failedArg).toMatchObject({
      ownerUserId: technicianUser.id,
      reportId: sampleReportRecord.reportId,
      failureReason: 'Provider rate limit exceeded.',
    });
  });
});
