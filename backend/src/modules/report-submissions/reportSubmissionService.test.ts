import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/model';
import type { AssignedWorkPackageSnapshot } from '../work-packages/model';
import type { AssignedWorkPackageService } from '../work-packages/assignedWorkPackageService';
import {
  REPORT_SUBMISSION_API_CONTRACT_VERSION,
  ReportSubmissionError,
  type ReportSubmissionRecord,
  type ReportSubmissionRequest,
} from './model';
import type { ReportSubmissionRepository } from './reportSubmissionRepository';
import { ReportSubmissionService } from './reportSubmissionService';

describe('ReportSubmissionService', () => {
  it('returns the accepted result when a concurrent identical submission already inserted the record', async () => {
    const request = buildRequest();
    const acceptedRecord = buildRecord(request);
    const repository = buildRepository({
      existingBeforeInsert: null,
      insertedOrExisting: acceptedRecord,
    });
    const service = new ReportSubmissionService(
      repository,
      buildAssignedWorkPackageService(),
      () => new Date('2026-04-23T14:30:00.000Z'),
    );

    await expect(service.submitForValidation(technician, request)).resolves.toMatchObject({
      reportId: request.reportId,
      serverReportVersion: acceptedRecord.serverReportVersion,
      reportState: 'submitted-pending-review',
      lifecycleState: 'Submitted - Pending Supervisor Review',
      syncState: 'synced',
    });

    expect(repository.insertAcceptedOrGetExisting).toHaveBeenCalledOnce();
  });

  it('converts a concurrent different submitted version into a structured conflict', async () => {
    const request = buildRequest();
    const existingRecord = buildRecord({
      ...request,
      objectVersion: '2026-04-23T14:11:00.000Z',
      idempotencyKey:
        'submit-report:tag-report:wp-seed-1001:tag-pt-101:2026-04-23T14:11:00.000Z',
    });
    const service = new ReportSubmissionService(
      buildRepository({
        existingBeforeInsert: null,
        insertedOrExisting: existingRecord,
      }),
      buildAssignedWorkPackageService(),
      () => new Date('2026-04-23T14:30:00.000Z'),
    );

    const error = await captureReportSubmissionError(() =>
      service.submitForValidation(technician, request),
    );

    expect(error.statusCode).toBe(409);
    expect(error.syncIssue).toEqual({
      reasonCode: 'conflicting-report-version',
      message: 'Report was already accepted at a different submitted version.',
      serverReportVersion: existingRecord.serverReportVersion,
    });
  });
});

const technician: AuthenticatedUser = {
  id: 'user-technician',
  email: 'tech@tagwise.local',
  displayName: 'Field Technician',
  role: 'technician',
};

function buildRepository(input: {
  existingBeforeInsert: ReportSubmissionRecord | null;
  insertedOrExisting: ReportSubmissionRecord;
}): ReportSubmissionRepository {
  return {
    getByReportId: vi.fn(async () => input.existingBeforeInsert),
    insertAcceptedOrGetExisting: vi.fn(async () => input.insertedOrExisting),
  } as unknown as ReportSubmissionRepository;
}

function buildAssignedWorkPackageService(): AssignedWorkPackageService {
  return {
    downloadAssignedPackage: vi.fn(async () => buildSnapshot()),
  } as unknown as AssignedWorkPackageService;
}

function buildRequest(overrides: Partial<ReportSubmissionRequest> = {}): ReportSubmissionRequest {
  return {
    contractVersion: REPORT_SUBMISSION_API_CONTRACT_VERSION,
    reportId: 'tag-report:wp-seed-1001:tag-pt-101',
    workPackageId: 'wp-seed-1001',
    tagId: 'tag-pt-101',
    templateId: 'tpl-pressure-as-found',
    templateVersion: '2026-04-v1',
    reportState: 'submitted-pending-sync',
    lifecycleState: 'Submitted - Pending Sync',
    syncState: 'pending-validation',
    objectVersion: '2026-04-23T14:10:00.000Z',
    idempotencyKey:
      'submit-report:tag-report:wp-seed-1001:tag-pt-101:2026-04-23T14:10:00.000Z',
    submittedAt: '2026-04-23T14:06:00.000Z',
    executionSummary: 'Structured pressure readings are captured.',
    historySummary: 'History available.',
    draftDiagnosisSummary: 'No local diagnosis.',
    evidenceReferences: [
      {
        label: 'as-found readings',
        requirementLevel: 'minimum',
        evidenceKind: 'structured-readings',
        satisfied: true,
        detail: 'Structured readings saved locally.',
      },
      {
        label: 'instrument note',
        requirementLevel: 'minimum',
        evidenceKind: 'observation-notes',
        satisfied: true,
        detail: 'Observation notes are captured locally.',
      },
    ],
    riskFlags: [
      {
        id: 'missing-history',
        reasonType: 'missing-history',
        justificationRequired: true,
        justificationText: 'Compared against paper record on site.',
      },
    ],
    photoAttachments: [],
    ...overrides,
  };
}

function buildRecord(request: ReportSubmissionRequest): ReportSubmissionRecord {
  return {
    ownerUserId: technician.id,
    reportId: request.reportId,
    workPackageId: request.workPackageId,
    tagId: request.tagId,
    templateId: request.templateId,
    templateVersion: request.templateVersion,
    localObjectVersion: request.objectVersion,
    idempotencyKey: request.idempotencyKey,
    serverReportVersion: `report-submission:${technician.id}:${request.reportId}:${request.objectVersion}`,
    reportState: 'submitted-pending-review',
    lifecycleState: 'Submitted - Pending Supervisor Review',
    syncState: 'synced',
    submittedAt: request.submittedAt,
    acceptedAt: '2026-04-23T14:30:00.000Z',
    payloadJson: request,
    createdAt: '2026-04-23T14:30:00.000Z',
    updatedAt: '2026-04-23T14:30:00.000Z',
  };
}

function buildSnapshot(): AssignedWorkPackageSnapshot {
  return {
    contractVersion: '2026-04-v1',
    generatedAt: '2026-04-23T12:00:00.000Z',
    summary: {
      id: 'wp-seed-1001',
      sourceReference: 'WO-1001',
      title: 'Seed work package',
      assignedTeam: 'Instrumentation',
      priority: 'routine',
      status: 'assigned',
      packageVersion: 1,
      snapshotContractVersion: '2026-04-v1',
      tagCount: 1,
      dueWindow: {
        startsAt: null,
        endsAt: null,
      },
      updatedAt: '2026-04-23T12:00:00.000Z',
    },
    tags: [
      {
        id: 'tag-pt-101',
        tagCode: 'PT-101',
        shortDescription: 'Pressure transmitter',
        area: 'Unit 1',
        parentAssetReference: 'A-100',
        instrumentFamily: 'pressure transmitter',
        instrumentSubtype: 'smart transmitter',
        measuredVariable: 'pressure',
        signalType: '4-20 mA',
        range: {
          min: 0,
          max: 10,
          unit: 'bar',
        },
        tolerance: '+/- 0.5%',
        criticality: 'medium',
        templateIds: ['tpl-pressure-as-found'],
        guidanceReferenceIds: [],
        historySummaryId: 'history-pt-101',
      },
    ],
    templates: [
      {
        id: 'tpl-pressure-as-found',
        instrumentFamily: 'pressure transmitter',
        testPattern: 'as-found calibration check',
        title: 'Pressure as-found',
        calculationMode: 'deviation',
        acceptanceStyle: 'tolerance pass/fail',
        captureSummary: 'Capture pressure readings.',
        captureFields: [],
        minimumSubmissionEvidence: ['as-found readings', 'instrument note'],
        expectedEvidence: ['supporting photo'],
        historyComparisonExpectation: 'compare last approved result',
      },
    ],
    guidance: [],
    historySummaries: [],
  };
}

async function captureReportSubmissionError(
  work: () => Promise<unknown>,
): Promise<ReportSubmissionError> {
  try {
    await work();
  } catch (error) {
    if (error instanceof ReportSubmissionError) {
      return error;
    }
  }

  throw new Error('Expected ReportSubmissionError.');
}
