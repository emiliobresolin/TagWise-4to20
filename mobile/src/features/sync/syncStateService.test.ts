import { describe, expect, it, vi } from 'vitest';

import type {
  UserOwnedDraftRecord,
  UserOwnedEvidenceMetadataRecord,
  UserOwnedQueueItemRecord,
} from '../../data/local/repositories/userPartitionedLocalTypes';
import type {
  UserPartitionedLocalStore,
  UserPartitionedLocalStoreFactory,
} from '../../data/local/repositories/userPartitionedLocalStoreFactory';
import type { ActiveUserSession } from '../auth/model';
import type { SharedExecutionShell } from '../execution/model';
import { LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE } from './queueContracts';
import { SyncStateService } from './syncStateService';

const connectedSession: ActiveUserSession = {
  userId: 'user-technician',
  email: 'tech@tagwise.local',
  displayName: 'Field Technician',
  role: 'technician',
  lastAuthenticatedAt: '2026-04-24T10:00:00.000Z',
  accessTokenExpiresAt: '2026-04-24T11:00:00.000Z',
  refreshTokenExpiresAt: '2026-04-25T11:00:00.000Z',
  connectionMode: 'connected',
  reviewActionsAvailable: false,
};

const offlineSession: ActiveUserSession = {
  ...connectedSession,
  connectionMode: 'offline',
};

describe('SyncStateService', () => {
  it('summarizes per-package sync state from local reports, queue records, and evidence issues', async () => {
    const reportDraft = buildDraftRecord({
      reportId: 'tag-report:wp-1:tag-1',
      workPackageId: 'wp-1',
      tagId: 'tag-1',
      syncState: 'queued',
    });
    const issueEvidence = buildEvidenceRecord({
      evidenceId: 'evidence-1',
      reportId: 'tag-report:wp-1:tag-1',
      syncState: 'sync-issue',
      syncIssue: 'object storage unavailable',
    });
    const queueItems = [
      buildQueueItem({
        queueItemId: 'submit-report:tag-report:wp-1:tag-1',
        reportId: 'tag-report:wp-1:tag-1',
        itemKind: 'submit-report',
        retryCount: 0,
      }),
      buildQueueItem({
        queueItemId: 'upload-evidence-binary:evidence-1',
        reportId: 'tag-report:wp-1:tag-1',
        itemKind: 'upload-evidence-binary',
        retryCount: 2,
      }),
    ];
    const service = new SyncStateService({
      userPartitions: buildStoreFactory({
        drafts: [reportDraft],
        evidence: [issueEvidence],
        queueItems,
      }),
      executionShellService: buildExecutionShellService(),
      evidenceUploadOrchestrator: buildEvidenceUploadOrchestrator(),
    });

    const summaries = await service.listWorkPackageSyncSummaries(connectedSession, [
      buildWorkPackage('wp-1'),
      buildWorkPackage('wp-2'),
    ]);

    expect(summaries['wp-1']).toMatchObject({
      workPackageId: 'wp-1',
      syncState: 'sync-issue',
      reportCount: 1,
      queueItemCount: 2,
      issueCount: 1,
    });
    expect(summaries['wp-2']).toMatchObject({
      workPackageId: 'wp-2',
      syncState: 'local-only',
      reportCount: 0,
      queueItemCount: 0,
      issueCount: 0,
    });
  });

  it('retries eligible local queue work on reconnect or connected app reopen', async () => {
    const shell = buildSubmittedShell({
      reportId: 'tag-report:wp-1:tag-1',
      workPackageId: 'wp-1',
      tagId: 'tag-1',
      syncState: 'queued',
      attachmentSyncState: 'sync-issue',
    });
    const loadShell = vi.fn(async () => shell);
    const syncSubmittedReportEvidence = vi.fn(async () => undefined);
    const service = new SyncStateService({
      userPartitions: buildStoreFactory({
        drafts: [
          buildDraftRecord({
            reportId: shell.report.reportId,
            workPackageId: shell.workPackageId,
            tagId: shell.tagId,
            syncState: 'queued',
          }),
        ],
        evidence: [
          buildEvidenceRecord({
            evidenceId: 'evidence-1',
            reportId: shell.report.reportId,
            syncState: 'sync-issue',
            syncIssue: 'metadata service unavailable',
          }),
        ],
        queueItems: [
          buildQueueItem({
            queueItemId: 'upload-evidence-metadata:evidence-1',
            reportId: shell.report.reportId,
            itemKind: 'upload-evidence-metadata',
            retryCount: 1,
          }),
        ],
      }),
      executionShellService: { loadShell },
      evidenceUploadOrchestrator: {
        syncSubmittedReportEvidence,
        refreshReportServerStatus: vi.fn(async () => undefined),
      },
    });

    await expect(service.retryEligibleReports(offlineSession)).resolves.toMatchObject({
      attempted: 0,
    });
    expect(syncSubmittedReportEvidence).not.toHaveBeenCalled();

    await expect(service.retryEligibleReports(connectedSession)).resolves.toMatchObject({
      attempted: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(loadShell).toHaveBeenCalledWith(connectedSession, 'wp-1', 'tag-1', 'pressure-template');
    expect(syncSubmittedReportEvidence).toHaveBeenCalledWith(connectedSession, shell);
  });

  it('retries submitted reports that only have the server-validation queue item remaining', async () => {
    const shell = buildSubmittedShell({
      reportId: 'tag-report:wp-1:tag-1',
      workPackageId: 'wp-1',
      tagId: 'tag-1',
      syncState: 'pending-validation',
      attachmentSyncState: 'pending-validation',
    });
    const syncSubmittedReportEvidence = vi.fn(async () => undefined);
    const service = new SyncStateService({
      userPartitions: buildStoreFactory({
        drafts: [
          buildDraftRecord({
            reportId: shell.report.reportId,
            workPackageId: shell.workPackageId,
            tagId: shell.tagId,
            syncState: 'pending-validation',
          }),
        ],
        evidence: [],
        queueItems: [
          buildQueueItem({
            queueItemId: 'submit-report:tag-report:wp-1:tag-1',
            reportId: shell.report.reportId,
            itemKind: 'submit-report',
            retryCount: 0,
          }),
        ],
      }),
      executionShellService: { loadShell: vi.fn(async () => shell) },
      evidenceUploadOrchestrator: {
        syncSubmittedReportEvidence,
        refreshReportServerStatus: vi.fn(async () => undefined),
      },
    });

    await expect(service.retryEligibleReports(connectedSession)).resolves.toMatchObject({
      attempted: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(syncSubmittedReportEvidence).toHaveBeenCalledWith(connectedSession, shell);
  });

  it('keeps failed automatic retries counted without reporting success', async () => {
    const shell = buildSubmittedShell({
      reportId: 'tag-report:wp-1:tag-1',
      workPackageId: 'wp-1',
      tagId: 'tag-1',
      syncState: 'queued',
      attachmentSyncState: 'sync-issue',
    });
    const syncSubmittedReportEvidence = vi.fn(async () => {
      throw new Error('object storage unavailable');
    });
    const service = new SyncStateService({
      userPartitions: buildStoreFactory({
        drafts: [
          buildDraftRecord({
            reportId: shell.report.reportId,
            workPackageId: shell.workPackageId,
            tagId: shell.tagId,
            syncState: 'queued',
          }),
        ],
        evidence: [
          buildEvidenceRecord({
            evidenceId: 'evidence-1',
            reportId: shell.report.reportId,
            syncState: 'sync-issue',
            syncIssue: 'metadata service unavailable',
          }),
        ],
        queueItems: [
          buildQueueItem({
            queueItemId: 'upload-evidence-metadata:evidence-1',
            reportId: shell.report.reportId,
            itemKind: 'upload-evidence-metadata',
            retryCount: 1,
          }),
        ],
      }),
      executionShellService: { loadShell: vi.fn(async () => shell) },
      evidenceUploadOrchestrator: {
        syncSubmittedReportEvidence,
        refreshReportServerStatus: vi.fn(async () => undefined),
      },
    });

    await expect(service.retryEligibleReports(connectedSession)).resolves.toMatchObject({
      attempted: 1,
      succeeded: 0,
      failed: 1,
    });
    expect(syncSubmittedReportEvidence).toHaveBeenCalledWith(connectedSession, shell);
  });

  it('keeps manual retry scoped to transport sync without changing report approval state', async () => {
    const shell = buildSubmittedShell({
      reportId: 'tag-report:wp-1:tag-1',
      workPackageId: 'wp-1',
      tagId: 'tag-1',
      syncState: 'sync-issue',
      attachmentSyncState: 'sync-issue',
    });
    const reloadedShell = {
      ...shell,
      report: {
        ...shell.report,
        lifecycleState: 'Submitted - Pending Sync' as const,
        syncState: 'queued' as const,
      },
    };
    const syncSubmittedReportEvidence = vi.fn(async () => undefined);
    const service = new SyncStateService({
      userPartitions: buildStoreFactory({
        drafts: [
          buildDraftRecord({
            reportId: shell.report.reportId,
            workPackageId: shell.workPackageId,
            tagId: shell.tagId,
            syncState: 'sync-issue',
          }),
        ],
        evidence: [
          buildEvidenceRecord({
            evidenceId: 'evidence-1',
            reportId: shell.report.reportId,
            syncState: 'sync-issue',
            syncIssue: 'binary upload unavailable',
          }),
        ],
        queueItems: [
          buildQueueItem({
            queueItemId: 'upload-evidence-binary:evidence-1',
            reportId: shell.report.reportId,
            itemKind: 'upload-evidence-binary',
            retryCount: 1,
          }),
        ],
      }),
      executionShellService: { loadShell: vi.fn(async () => reloadedShell) },
      evidenceUploadOrchestrator: {
        syncSubmittedReportEvidence,
        refreshReportServerStatus: vi.fn(async () => undefined),
      },
    });

    const retryResult = await service.retryReportSync(connectedSession, shell);

    expect(syncSubmittedReportEvidence).toHaveBeenCalledOnce();
    expect(retryResult.report.lifecycleState).toBe('Submitted - Pending Sync');
    expect(retryResult.report.syncState).toBe('queued');
  });

  it('refreshes connected report server status and reloads the local shell', async () => {
    const shell = buildSubmittedShell({
      reportId: 'tag-report:wp-1:tag-1',
      workPackageId: 'wp-1',
      tagId: 'tag-1',
      syncState: 'synced',
      attachmentSyncState: 'synced',
    });
    const reloadedShell = {
      ...shell,
      report: {
        ...shell.report,
        state: 'technician-owned-draft' as const,
        lifecycleState: 'Returned by Supervisor' as const,
        approvalHistory: {
          items: [
            {
              auditEventId: 'audit-return-1',
              actorRole: 'supervisor',
              actionType: 'report.supervisor.returned',
              occurredAt: '2026-04-24T12:00:00.000Z',
              correlationId: 'corr-return-1',
              priorState: 'Submitted - Pending Supervisor Review',
              nextState: 'Returned by Supervisor',
              comment: 'Rework the observations.',
            },
          ],
          placeholder: '',
        },
      },
    };
    const loadShell = vi.fn(async () => reloadedShell);
    const refreshReportServerStatus = vi.fn(async () => undefined);
    const service = new SyncStateService({
      userPartitions: buildStoreFactory({
        drafts: [],
        evidence: [],
        queueItems: [],
      }),
      executionShellService: { loadShell },
      evidenceUploadOrchestrator: {
        syncSubmittedReportEvidence: vi.fn(async () => undefined),
        refreshReportServerStatus,
      },
    });

    const refreshed = await service.refreshReportServerStatus(connectedSession, shell);

    expect(refreshReportServerStatus).toHaveBeenCalledWith(connectedSession, shell);
    expect(loadShell).toHaveBeenCalledWith(connectedSession, 'wp-1', 'tag-1', 'pressure-template');
    expect(refreshed.report).toMatchObject({
      state: 'technician-owned-draft',
      lifecycleState: 'Returned by Supervisor',
      approvalHistory: {
        items: [
          expect.objectContaining({
            actionType: 'report.supervisor.returned',
            comment: 'Rework the observations.',
          }),
        ],
      },
    });
  });
});

function buildStoreFactory(input: {
  drafts: UserOwnedDraftRecord[];
  evidence: UserOwnedEvidenceMetadataRecord[];
  queueItems: UserOwnedQueueItemRecord[];
}): UserPartitionedLocalStoreFactory {
  const store = {
    ownerUserId: connectedSession.userId,
    drafts: {
      listDrafts: vi.fn(async () => input.drafts),
    },
    evidenceMetadata: {
      listEvidenceByBusinessObject: vi.fn(async ({ businessObjectId }) =>
        input.evidence.filter((item) => item.businessObjectId === businessObjectId),
      ),
    },
    queueItems: {
      listQueueItemsByBusinessObject: vi.fn(async ({ businessObjectId }) =>
        input.queueItems.filter((item) => item.businessObjectId === businessObjectId),
      ),
    },
  } as unknown as UserPartitionedLocalStore;

  return {
    forUser: vi.fn(() => store),
  } as unknown as UserPartitionedLocalStoreFactory;
}

function buildExecutionShellService() {
  return {
    loadShell: vi.fn(async () => null),
  };
}

function buildEvidenceUploadOrchestrator() {
  return {
    syncSubmittedReportEvidence: vi.fn(async () => undefined),
    refreshReportServerStatus: vi.fn(async () => undefined),
  };
}

function buildDraftRecord(input: {
  reportId: string;
  workPackageId: string;
  tagId: string;
  syncState: SharedExecutionShell['report']['syncState'];
}): UserOwnedDraftRecord {
  return {
    ownerUserId: connectedSession.userId,
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: input.reportId,
    summaryText: `Submitted report for ${input.tagId}`,
    payloadJson: JSON.stringify({
      reportId: input.reportId,
      workPackageId: input.workPackageId,
      tagId: input.tagId,
      templateId: 'pressure-template',
      templateVersion: '2026.04',
      state: 'submitted-pending-sync',
      lifecycleState: 'Submitted - Pending Sync',
      syncState: input.syncState,
      updatedAt: '2026-04-24T10:00:00.000Z',
    }),
    createdAt: '2026-04-24T10:00:00.000Z',
    updatedAt: '2026-04-24T10:00:00.000Z',
  };
}

function buildEvidenceRecord(input: {
  evidenceId: string;
  reportId: string;
  syncState: SharedExecutionShell['report']['syncState'];
  syncIssue: string | null;
}): UserOwnedEvidenceMetadataRecord {
  return {
    ownerUserId: connectedSession.userId,
    evidenceId: input.evidenceId,
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: input.reportId,
    fileName: `${input.evidenceId}.jpg`,
    mediaRelativePath: `${input.evidenceId}.jpg`,
    mimeType: 'image/jpeg',
    payloadJson: JSON.stringify({
      kind: 'photo',
      workPackageId: 'wp-1',
      tagId: 'tag-1',
      templateId: 'pressure-template',
      templateVersion: '2026.04',
      draftReportId: input.reportId,
      executionStepId: 'guidance',
      source: 'camera',
      width: 100,
      height: 100,
      fileSize: 128,
      syncState: input.syncState,
      syncIssue: input.syncIssue,
    }),
    createdAt: '2026-04-24T10:00:00.000Z',
    updatedAt: '2026-04-24T10:00:00.000Z',
  };
}

function buildQueueItem(input: {
  queueItemId: string;
  reportId: string;
  itemKind: string;
  retryCount: number;
}): UserOwnedQueueItemRecord {
  return {
    ownerUserId: connectedSession.userId,
    queueItemId: input.queueItemId,
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: input.reportId,
    itemKind: input.itemKind,
    payloadJson: JSON.stringify({
      itemType: input.itemKind,
      reportId: input.reportId,
      retryCount: input.retryCount,
      dependencyStatus: 'ready',
    }),
    createdAt: '2026-04-24T10:00:00.000Z',
    updatedAt: '2026-04-24T10:00:00.000Z',
  };
}

function buildWorkPackage(id: string) {
  return {
    id,
    title: `Package ${id}`,
    sourceReference: `SRC-${id}`,
    assignedTeam: 'Instrumentation',
    priority: 'routine' as const,
    status: 'assigned' as const,
    packageVersion: 1,
    snapshotContractVersion: '2026-04-v1',
    tagCount: 1,
    dueWindow: {
      startsAt: null,
      endsAt: null,
    },
    updatedAt: '2026-04-24T10:00:00.000Z',
    downloadedAt: null,
    localUpdatedAt: '2026-04-24T10:00:00.000Z',
    hasSnapshot: false,
    snapshotGeneratedAt: null,
  };
}

function buildSubmittedShell(input: {
  reportId: string;
  workPackageId: string;
  tagId: string;
  syncState: SharedExecutionShell['report']['syncState'];
  attachmentSyncState: SharedExecutionShell['report']['syncState'];
}): SharedExecutionShell {
  return {
    workPackageId: input.workPackageId,
    workPackageTitle: 'Package wp-1',
    tagId: input.tagId,
    tagCode: 'PT-101',
    template: {
      id: 'pressure-template',
      title: 'Pressure test',
      version: '2026.04',
      instrumentFamily: 'pressure',
      testPattern: 'as-found',
      calculationMode: 'direct',
      acceptanceStyle: 'tolerance',
      captureSummary: 'Capture readings',
      captureFields: [],
      calculationRangeOverride: null,
      conversionBasisSummary: null,
      expectedRangeSummary: null,
      checklistPrompts: [],
      checklistSteps: [],
      guidedDiagnosisPrompts: [],
      minimumSubmissionEvidence: [],
      expectedEvidence: [],
      historyComparisonExpectation: 'none',
      steps: [],
    },
    steps: [],
    progress: {
      currentStepId: 'report',
      visitedStepIds: ['report'],
      updatedAt: '2026-04-24T10:00:00.000Z',
    },
    calculation: null,
    riskInputs: {
      historyState: 'available',
      missingContextFieldLabels: [],
    },
    guidance: {
      checklistItems: [],
      guidedDiagnosisPrompts: [],
      linkedGuidance: [],
      riskState: 'clear',
      riskHooks: [],
      riskItems: [],
      submitReadiness: 'ready',
      submitBlockingHooks: [],
    },
    evidence: {
      draftReportId: input.reportId,
      draftReportState: 'submitted-pending-sync',
      observationNotes: '',
      calculationEvidenceUpdatedAt: null,
      guidanceEvidenceUpdatedAt: null,
      photoAttachments: [
        {
          evidenceId: 'evidence-1',
          executionStepId: 'guidance',
          fileName: 'evidence-1.jpg',
          mimeType: 'image/jpeg',
          previewUri: 'file:///local/evidence-1.jpg',
          mediaRelativePath: 'evidence-1.jpg',
          source: 'camera',
          width: 100,
          height: 100,
          fileSize: 128,
          syncState: input.attachmentSyncState,
          metadataSyncedAt: null,
          serverEvidenceId: null,
          storageObjectKey: null,
          uploadAuthorizedAt: null,
          binaryUploadedAt: null,
          presenceFinalizedAt: null,
          syncIssue: input.attachmentSyncState === 'sync-issue' ? 'sync failed' : null,
          createdAt: '2026-04-24T10:00:00.000Z',
          updatedAt: '2026-04-24T10:00:00.000Z',
        },
      ],
      photoEvidenceUpdatedAt: null,
    },
    report: {
      reportId: input.reportId,
      state: 'submitted-pending-sync',
      lifecycleState: 'Submitted - Pending Sync',
      syncState: input.syncState,
      technicianName: 'Field Technician',
      technicianEmail: 'tech@tagwise.local',
      tagContextSummary: 'Package / PT-101',
      executionSummary: 'No readings',
      historySummary: 'No history',
      draftDiagnosisSummary: 'No diagnosis',
      checklistOutcomes: [],
      evidenceReferences: [],
      riskFlags: [],
      reviewNotes: '',
      savedAt: null,
      submittedAt: '2026-04-24T10:00:00.000Z',
    },
  };
}
