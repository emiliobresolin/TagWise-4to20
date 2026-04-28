import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { bootstrapLocalDatabase, type LocalRuntime } from '../../data/local/bootstrapLocalDatabase';
import type {
  UserPartitionedLocalStore,
  UserPartitionedLocalStoreFactory,
} from '../../data/local/repositories/userPartitionedLocalStoreFactory';
import type { ActiveUserSession } from '../auth/model';
import type {
  SharedExecutionPhotoAttachment,
  SharedExecutionShell,
  StoredExecutionPhotoAttachmentPayload,
} from '../execution/model';
import type { EvidenceBinaryUploadBoundary } from '../../platform/files/evidenceBinaryUploadBoundary';
import { createNodeAppSandboxBoundary } from '../../../tests/helpers/createNodeAppSandboxBoundary';
import { createNodeSqliteDatabase } from '../../../tests/helpers/createNodeSqliteDatabase';
import {
  EVIDENCE_SYNC_API_CONTRACT_VERSION,
  EvidenceUploadApiError,
  REPORT_SUBMISSION_API_CONTRACT_VERSION,
  type EvidenceUploadApiClient,
} from './evidenceUploadApiClient';
import { EvidenceUploadOrchestrator } from './evidenceUploadOrchestrator';
import {
  buildSubmitReportQueueItemId,
  buildUploadEvidenceBinaryQueueItemId,
  buildUploadEvidenceMetadataQueueItemId,
  LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
  type SubmitReportQueuePayload,
  type UploadEvidenceBinaryQueuePayload,
  type UploadEvidenceMetadataQueuePayload,
  SUBMIT_REPORT_QUEUE_ITEM_KIND,
  UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND,
  UPLOAD_EVIDENCE_METADATA_QUEUE_ITEM_KIND,
} from './queueContracts';

const createdDirectories: string[] = [];
const openRuntimes: LocalRuntime[] = [];

afterEach(async () => {
  while (openRuntimes.length > 0) {
    await openRuntimes.pop()?.database.closeAsync?.();
  }

  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();
    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

const connectedSession: ActiveUserSession = {
  userId: 'user-technician',
  email: 'tech@tagwise.local',
  displayName: 'Field Technician',
  role: 'technician',
  lastAuthenticatedAt: '2026-04-23T14:00:00.000Z',
  accessTokenExpiresAt: '2026-04-23T15:00:00.000Z',
  refreshTokenExpiresAt: '2026-04-24T15:00:00.000Z',
  connectionMode: 'connected',
  reviewActionsAvailable: false,
};

describe('EvidenceUploadOrchestrator', () => {
  it('syncs metadata, authorizes upload, uploads the binary, and finalizes server presence', async () => {
    const { store, shell, attachment, localFile } = await createFixture();
    const syncEvidenceMetadata = vi.fn(
      async (request: Parameters<EvidenceUploadApiClient['syncEvidenceMetadata']>[0]) => ({
        contractVersion: EVIDENCE_SYNC_API_CONTRACT_VERSION,
        serverEvidenceId: 'server-evidence-1',
        reportId: request.reportId,
        evidenceId: request.evidenceId,
        metadataReceivedAt: '2026-04-23T14:10:00.000Z',
        presenceStatus: 'metadata-recorded' as const,
      }),
    );
    const authorizeEvidenceBinaryUpload = vi.fn(
      async (
        request: Parameters<EvidenceUploadApiClient['authorizeEvidenceBinaryUpload']>[0],
      ) => ({
        contractVersion: EVIDENCE_SYNC_API_CONTRACT_VERSION,
        serverEvidenceId: 'server-evidence-1',
        reportId: request.reportId,
        evidenceId: request.evidenceId,
        objectKey: 'evidence/user-technician/report/photo.jpg',
        uploadUrl: 'https://storage.tagwise.test/upload',
        uploadMethod: 'PUT' as const,
        requiredHeaders: { 'content-type': 'image/jpeg' },
        expiresAt: '2026-04-23T14:25:00.000Z',
      }),
    );
    const finalizeEvidenceBinaryUpload = vi.fn(
      async (
        request: Parameters<EvidenceUploadApiClient['finalizeEvidenceBinaryUpload']>[0],
      ) => ({
        contractVersion: EVIDENCE_SYNC_API_CONTRACT_VERSION,
        serverEvidenceId: request.serverEvidenceId,
        reportId: shell.report.reportId,
        evidenceId: attachment.evidenceId,
        presenceStatus: 'binary-finalized' as const,
        presenceFinalizedAt: '2026-04-23T14:12:00.000Z',
      }),
    );
    const uploadBinary = vi.fn(
      async (_input: Parameters<EvidenceBinaryUploadBoundary['uploadBinary']>[0]) => undefined,
    );
    const orchestrator = new EvidenceUploadOrchestrator({
      userPartitions: shellRuntimeUserPartitions(store),
      apiClient: {
        syncEvidenceMetadata,
        authorizeEvidenceBinaryUpload,
        finalizeEvidenceBinaryUpload,
        submitReportForValidation: vi.fn(),
        getReportSubmissionStatus: vi.fn(),
      },
      binaryUploadBoundary: { uploadBinary },
      now: () => new Date('2026-04-23T14:11:00.000Z'),
    });

    await orchestrator.syncSubmittedReportEvidence(connectedSession, shell);

    expect(syncEvidenceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        contractVersion: EVIDENCE_SYNC_API_CONTRACT_VERSION,
        evidenceId: attachment.evidenceId,
      }),
    );
    expect(authorizeEvidenceBinaryUpload).toHaveBeenCalledWith({
      contractVersion: EVIDENCE_SYNC_API_CONTRACT_VERSION,
      reportId: shell.report.reportId,
      evidenceId: attachment.evidenceId,
    });
    expect(uploadBinary).toHaveBeenCalledWith({
      localFileUri: localFile,
      uploadUrl: 'https://storage.tagwise.test/upload',
      uploadMethod: 'PUT',
      requiredHeaders: { 'content-type': 'image/jpeg' },
    });
    expect(finalizeEvidenceBinaryUpload).toHaveBeenCalledWith({
      contractVersion: EVIDENCE_SYNC_API_CONTRACT_VERSION,
      serverEvidenceId: 'server-evidence-1',
    });

    const payload = await loadPhotoPayload(store, attachment.evidenceId);
    expect(payload).toMatchObject({
      syncState: 'pending-validation',
      metadataSyncedAt: '2026-04-23T14:10:00.000Z',
      serverEvidenceId: 'server-evidence-1',
      storageObjectKey: 'evidence/user-technician/report/photo.jpg',
      uploadAuthorizedAt: '2026-04-23T14:11:00.000Z',
      binaryUploadedAt: '2026-04-23T14:12:00.000Z',
      presenceFinalizedAt: '2026-04-23T14:12:00.000Z',
      syncIssue: null,
    });
    expect(existsSync(localFile)).toBe(true);
    await expect(listEvidenceQueuePayloads(store, shell.report.reportId)).resolves.toEqual([]);
  });

  it('preserves local evidence and queue state when metadata sync fails', async () => {
    const { store, shell, attachment, localFile } = await createFixture();
    await seedEvidenceQueueItems(store, shell, attachment);
    const syncEvidenceMetadata = vi.fn(async () => {
      throw new Error('metadata service unavailable');
    });
    const orchestrator = new EvidenceUploadOrchestrator({
      userPartitions: shellRuntimeUserPartitions(store),
      apiClient: {
        syncEvidenceMetadata,
        authorizeEvidenceBinaryUpload: vi.fn(),
        finalizeEvidenceBinaryUpload: vi.fn(),
      } as unknown as EvidenceUploadApiClient,
      binaryUploadBoundary: { uploadBinary: vi.fn() },
    });

    await expect(orchestrator.syncSubmittedReportEvidence(connectedSession, shell)).rejects.toThrow(
      'metadata service unavailable',
    );

    const payload = await loadPhotoPayload(store, attachment.evidenceId);
    expect(payload).toMatchObject({
      syncState: 'sync-issue',
      metadataSyncedAt: null,
      serverEvidenceId: null,
      syncIssue: 'metadata service unavailable',
    });
    expect(existsSync(localFile)).toBe(true);

    const queuePayloads = await listEvidenceQueuePayloads(store, shell.report.reportId);
    expect(queuePayloads).toHaveLength(2);
    expect(queuePayloads.find(isMetadataPayload)).toMatchObject({
      itemType: 'upload-evidence-metadata',
      dependencyStatus: 'ready',
      retryCount: 1,
    });
    expect(queuePayloads.find(isBinaryPayload)).toMatchObject({
      itemType: 'upload-evidence-binary',
      dependencyStatus: 'waiting-on-evidence-metadata',
      retryCount: 0,
    });
  });

  it('preserves local evidence, authorization state, and queue state when finalization fails', async () => {
    const syncedAttachment = buildPhotoAttachment({
      metadataSyncedAt: '2026-04-23T14:10:00.000Z',
      serverEvidenceId: 'server-evidence-1',
      syncState: 'syncing',
    });
    const { store, shell, attachment, localFile } = await createFixture(syncedAttachment);
    await seedEvidenceQueueItems(store, shell, attachment, {
      includeMetadataQueueItem: false,
      binaryDependencyStatus: 'ready',
    });
    const authorizeEvidenceBinaryUpload = vi.fn(
      async (
        request: Parameters<EvidenceUploadApiClient['authorizeEvidenceBinaryUpload']>[0],
      ) => ({
        contractVersion: EVIDENCE_SYNC_API_CONTRACT_VERSION,
        serverEvidenceId: 'server-evidence-1',
        reportId: request.reportId,
        evidenceId: request.evidenceId,
        objectKey: 'evidence/user-technician/report/photo.jpg',
        uploadUrl: 'https://storage.tagwise.test/upload',
        uploadMethod: 'PUT' as const,
        requiredHeaders: { 'content-type': 'image/jpeg' },
        expiresAt: '2026-04-23T14:25:00.000Z',
      }),
    );
    const uploadBinary = vi.fn(
      async (_input: Parameters<EvidenceBinaryUploadBoundary['uploadBinary']>[0]) => undefined,
    );
    const finalizeEvidenceBinaryUpload = vi.fn(async () => {
      throw new Error('object storage verification unavailable');
    });
    const orchestrator = new EvidenceUploadOrchestrator({
      userPartitions: shellRuntimeUserPartitions(store),
      apiClient: {
        syncEvidenceMetadata: vi.fn(),
        authorizeEvidenceBinaryUpload,
        finalizeEvidenceBinaryUpload,
      } as unknown as EvidenceUploadApiClient,
      binaryUploadBoundary: { uploadBinary },
      now: () => new Date('2026-04-23T14:11:00.000Z'),
    });

    await expect(orchestrator.syncSubmittedReportEvidence(connectedSession, shell)).rejects.toThrow(
      'object storage verification unavailable',
    );

    expect(uploadBinary).toHaveBeenCalledOnce();
    const payload = await loadPhotoPayload(store, attachment.evidenceId);
    expect(payload).toMatchObject({
      syncState: 'sync-issue',
      metadataSyncedAt: '2026-04-23T14:10:00.000Z',
      serverEvidenceId: 'server-evidence-1',
      storageObjectKey: 'evidence/user-technician/report/photo.jpg',
      uploadAuthorizedAt: '2026-04-23T14:11:00.000Z',
      presenceFinalizedAt: null,
      syncIssue: 'object storage verification unavailable',
    });
    expect(existsSync(localFile)).toBe(true);

    const queuePayloads = await listEvidenceQueuePayloads(store, shell.report.reportId);
    expect(queuePayloads).toHaveLength(1);
    expect(queuePayloads[0]).toMatchObject({
      itemType: 'upload-evidence-binary',
      dependencyStatus: 'ready',
      retryCount: 1,
    });
  });

  it('submits finalized reports for validation and refreshes local state from the server outcome', async () => {
    const syncedAttachment = buildPhotoAttachment({
      metadataSyncedAt: '2026-04-23T14:10:00.000Z',
      serverEvidenceId: 'server-evidence-1',
      presenceFinalizedAt: '2026-04-23T14:12:00.000Z',
      syncState: 'pending-validation',
    });
    const { runtime, store, shell, attachment } = await createFixture(syncedAttachment);
    await seedReportDraftAndSubmitQueue(store, shell);
    await runtime.repositories.localWorkState.setUnsyncedWorkCount(1);
    const submitReportForValidation = vi.fn(
      async (
        request: Parameters<EvidenceUploadApiClient['submitReportForValidation']>[0],
      ) => ({
        contractVersion: REPORT_SUBMISSION_API_CONTRACT_VERSION,
        reportId: request.reportId,
        serverReportVersion: 'server-report-version-1',
        reportState: 'submitted-pending-review' as const,
        lifecycleState: 'Submitted - Pending Supervisor Review' as const,
        syncState: 'synced' as const,
        acceptedAt: '2026-04-23T14:30:00.000Z',
      }),
    );
    const orchestrator = new EvidenceUploadOrchestrator({
      userPartitions: shellRuntimeUserPartitions(store),
      apiClient: {
        syncEvidenceMetadata: vi.fn(),
        authorizeEvidenceBinaryUpload: vi.fn(),
        finalizeEvidenceBinaryUpload: vi.fn(),
        submitReportForValidation,
      } as unknown as EvidenceUploadApiClient,
      binaryUploadBoundary: { uploadBinary: vi.fn() },
      localWorkState: runtime.repositories.localWorkState,
      now: () => new Date('2026-04-23T14:20:00.000Z'),
    });

    await orchestrator.syncSubmittedReportEvidence(connectedSession, shell);

    expect(submitReportForValidation).toHaveBeenCalledWith(
      expect.objectContaining({
        contractVersion: REPORT_SUBMISSION_API_CONTRACT_VERSION,
        reportId: shell.report.reportId,
        reportState: 'submitted-pending-sync',
        lifecycleState: 'Submitted - Pending Sync',
        syncState: 'pending-validation',
        objectVersion: '2026-04-23T14:05:00.000Z',
        idempotencyKey:
          'submit-report:tag-report:wp-local-001:tag-001:2026-04-23T14:05:00.000Z',
        photoAttachments: [
          {
            evidenceId: attachment.evidenceId,
            serverEvidenceId: 'server-evidence-1',
            presenceFinalizedAt: '2026-04-23T14:12:00.000Z',
            syncState: 'pending-validation',
          },
        ],
      }),
    );

    const draftPayload = await loadReportDraftPayload(store, shell.report.reportId);
    expect(draftPayload).toMatchObject({
      state: 'submitted-pending-review',
      lifecycleState: 'Submitted - Pending Supervisor Review',
      syncState: 'synced',
      syncIssue: null,
      syncIssueReasonCode: null,
      updatedAt: '2026-04-23T14:30:00.000Z',
    });
    await expect(loadSubmitQueuePayload(store, shell.report.reportId)).resolves.toBeNull();
    await expect(loadPhotoPayload(store, attachment.evidenceId)).resolves.toMatchObject({
      syncState: 'synced',
      syncIssue: null,
    });
    await expect(runtime.repositories.localWorkState.getUnsyncedWorkCount()).resolves.toBe(0);
  });

  it('cleans no-op evidence queue items when returned report resubmission is accepted with finalized photo evidence', async () => {
    const syncedAttachment = buildPhotoAttachment({
      metadataSyncedAt: '2026-04-23T14:10:00.000Z',
      serverEvidenceId: 'server-evidence-1',
      presenceFinalizedAt: '2026-04-23T14:12:00.000Z',
      syncState: 'synced',
    });
    const { runtime, store, shell, attachment } = await createFixture(syncedAttachment);
    await seedReportDraftAndSubmitQueue(store, shell);
    await seedEvidenceQueueItems(store, shell, attachment, { binaryDependencyStatus: 'ready' });
    await runtime.repositories.localWorkState.setUnsyncedWorkCount(1);
    const syncEvidenceMetadata = vi.fn();
    const authorizeEvidenceBinaryUpload = vi.fn();
    const finalizeEvidenceBinaryUpload = vi.fn();
    const submitReportForValidation = vi.fn(
      async (
        request: Parameters<EvidenceUploadApiClient['submitReportForValidation']>[0],
      ) => ({
        contractVersion: REPORT_SUBMISSION_API_CONTRACT_VERSION,
        reportId: request.reportId,
        serverReportVersion: 'server-report-version-resubmitted',
        reportState: 'submitted-pending-review' as const,
        lifecycleState: 'Submitted - Pending Supervisor Review' as const,
        syncState: 'synced' as const,
        acceptedAt: '2026-04-23T16:30:00.000Z',
      }),
    );
    const orchestrator = new EvidenceUploadOrchestrator({
      userPartitions: shellRuntimeUserPartitions(store),
      apiClient: {
        syncEvidenceMetadata,
        authorizeEvidenceBinaryUpload,
        finalizeEvidenceBinaryUpload,
        submitReportForValidation,
      } as unknown as EvidenceUploadApiClient,
      binaryUploadBoundary: { uploadBinary: vi.fn() },
      localWorkState: runtime.repositories.localWorkState,
      now: () => new Date('2026-04-23T16:20:00.000Z'),
    });

    await expect(listEvidenceQueuePayloads(store, shell.report.reportId)).resolves.toHaveLength(2);

    await orchestrator.syncSubmittedReportEvidence(connectedSession, shell);

    expect(syncEvidenceMetadata).not.toHaveBeenCalled();
    expect(authorizeEvidenceBinaryUpload).not.toHaveBeenCalled();
    expect(finalizeEvidenceBinaryUpload).not.toHaveBeenCalled();
    expect(submitReportForValidation).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: shell.report.reportId,
        photoAttachments: [
          expect.objectContaining({
            evidenceId: attachment.evidenceId,
            serverEvidenceId: 'server-evidence-1',
            presenceFinalizedAt: '2026-04-23T14:12:00.000Z',
          }),
        ],
      }),
    );
    await expect(listEvidenceQueuePayloads(store, shell.report.reportId)).resolves.toEqual([]);
    await expect(loadSubmitQueuePayload(store, shell.report.reportId)).resolves.toBeNull();
    await expect(runtime.repositories.localWorkState.getUnsyncedWorkCount()).resolves.toBe(0);
  });

  it('refreshes returned server status into editable local rework state with approval history', async () => {
    const syncedAttachment = buildPhotoAttachment({
      metadataSyncedAt: '2026-04-23T14:10:00.000Z',
      serverEvidenceId: 'server-evidence-1',
      presenceFinalizedAt: '2026-04-23T14:12:00.000Z',
      syncState: 'synced',
    });
    const { store, shell } = await createFixture(syncedAttachment);
    await seedReportDraftAndSubmitQueue(store, shell);
    await store.queueItems.deleteQueueItem(buildSubmitReportQueueItemId(shell.report.reportId));
    const getReportSubmissionStatus = vi.fn(async () => ({
      contractVersion: REPORT_SUBMISSION_API_CONTRACT_VERSION,
      reportId: shell.report.reportId,
      serverReportVersion: 'server-report-version-returned',
      reportState: 'returned-by-supervisor' as const,
      lifecycleState: 'Returned by Supervisor' as const,
      syncState: 'synced' as const,
      acceptedAt: '2026-04-23T15:30:00.000Z',
      approvalHistory: {
        items: [
          {
            auditEventId: 'audit-return-1',
            actorRole: 'supervisor',
            actionType: 'report.supervisor.returned',
            occurredAt: '2026-04-23T15:30:00.000Z',
            correlationId: 'corr-return-1',
            priorState: 'Submitted - Pending Supervisor Review',
            nextState: 'Returned by Supervisor',
            comment: 'Rework the observations before approval.',
          },
        ],
        placeholder: '',
      },
    }));
    const orchestrator = new EvidenceUploadOrchestrator({
      userPartitions: shellRuntimeUserPartitions(store),
      apiClient: {
        syncEvidenceMetadata: vi.fn(),
        authorizeEvidenceBinaryUpload: vi.fn(),
        finalizeEvidenceBinaryUpload: vi.fn(),
        submitReportForValidation: vi.fn(),
        getReportSubmissionStatus,
      } as unknown as EvidenceUploadApiClient,
      binaryUploadBoundary: { uploadBinary: vi.fn() },
      now: () => new Date('2026-04-23T15:31:00.000Z'),
    });

    await orchestrator.refreshReportServerStatus(connectedSession, shell);

    expect(getReportSubmissionStatus).toHaveBeenCalledWith(shell.report.reportId);
    await expect(loadReportDraftPayload(store, shell.report.reportId)).resolves.toMatchObject({
      state: 'technician-owned-draft',
      lifecycleState: 'Returned by Supervisor',
      syncState: 'synced',
      syncIssue: null,
      syncIssueReasonCode: null,
      approvalHistory: {
        items: [
          expect.objectContaining({
            actionType: 'report.supervisor.returned',
            comment: 'Rework the observations before approval.',
          }),
        ],
      },
      updatedAt: '2026-04-23T15:30:00.000Z',
    });
  });

  it('keeps rejected submissions queued with the structured server sync issue', async () => {
    const syncedAttachment = buildPhotoAttachment({
      metadataSyncedAt: '2026-04-23T14:10:00.000Z',
      serverEvidenceId: 'server-evidence-1',
      presenceFinalizedAt: '2026-04-23T14:12:00.000Z',
      syncState: 'pending-validation',
    });
    const { store, shell } = await createFixture(syncedAttachment);
    await seedReportDraftAndSubmitQueue(store, shell);
    const submitReportForValidation = vi.fn(async () => {
      throw new EvidenceUploadApiError('Minimum evidence is missing: as-found readings.', 422, 'server', {
        reasonCode: 'minimum-evidence-missing',
        message: 'Minimum evidence is missing: as-found readings.',
      });
    });
    const orchestrator = new EvidenceUploadOrchestrator({
      userPartitions: shellRuntimeUserPartitions(store),
      apiClient: {
        syncEvidenceMetadata: vi.fn(),
        authorizeEvidenceBinaryUpload: vi.fn(),
        finalizeEvidenceBinaryUpload: vi.fn(),
        submitReportForValidation,
      } as unknown as EvidenceUploadApiClient,
      binaryUploadBoundary: { uploadBinary: vi.fn() },
      now: () => new Date('2026-04-23T14:20:00.000Z'),
    });

    await expect(orchestrator.syncSubmittedReportEvidence(connectedSession, shell)).rejects.toThrow(
      'Minimum evidence is missing: as-found readings.',
    );

    await expect(loadReportDraftPayload(store, shell.report.reportId)).resolves.toMatchObject({
      state: 'submitted-pending-sync',
      lifecycleState: 'Submitted - Pending Sync',
      syncState: 'sync-issue',
      syncIssue: 'Minimum evidence is missing: as-found readings.',
      syncIssueReasonCode: 'minimum-evidence-missing',
    });
    await expect(loadSubmitQueuePayload(store, shell.report.reportId)).resolves.toMatchObject({
      itemType: 'submit-report',
      retryCount: 1,
    });
  });

  it('moves malformed submit queue payloads into sync issue instead of counting them as success', async () => {
    const syncedAttachment = buildPhotoAttachment({
      metadataSyncedAt: '2026-04-23T14:10:00.000Z',
      serverEvidenceId: 'server-evidence-1',
      presenceFinalizedAt: '2026-04-23T14:12:00.000Z',
      syncState: 'pending-validation',
    });
    const { store, shell } = await createFixture(syncedAttachment);
    await seedReportDraftAndSubmitQueue(store, shell);
    await store.queueItems.enqueue({
      queueItemId: buildSubmitReportQueueItemId(shell.report.reportId),
      businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
      businessObjectId: shell.report.reportId,
      itemKind: SUBMIT_REPORT_QUEUE_ITEM_KIND,
      payloadJson: JSON.stringify({
        itemType: SUBMIT_REPORT_QUEUE_ITEM_KIND,
        reportId: shell.report.reportId,
        retryCount: 0,
      }),
    });
    const submitReportForValidation = vi.fn();
    const orchestrator = new EvidenceUploadOrchestrator({
      userPartitions: shellRuntimeUserPartitions(store),
      apiClient: {
        syncEvidenceMetadata: vi.fn(),
        authorizeEvidenceBinaryUpload: vi.fn(),
        finalizeEvidenceBinaryUpload: vi.fn(),
        submitReportForValidation,
      } as unknown as EvidenceUploadApiClient,
      binaryUploadBoundary: { uploadBinary: vi.fn() },
      now: () => new Date('2026-04-23T14:20:00.000Z'),
    });

    await expect(orchestrator.syncSubmittedReportEvidence(connectedSession, shell)).rejects.toThrow(
      'Report submission queue payload is malformed and needs local recovery.',
    );

    expect(submitReportForValidation).not.toHaveBeenCalled();
    await expect(loadReportDraftPayload(store, shell.report.reportId)).resolves.toMatchObject({
      state: 'submitted-pending-sync',
      lifecycleState: 'Submitted - Pending Sync',
      syncState: 'sync-issue',
      syncIssue: 'Report submission queue payload is malformed and needs local recovery.',
      syncIssueReasonCode: 'malformed-report-payload',
    });
    await expect(loadSubmitQueuePayload(store, shell.report.reportId)).resolves.toMatchObject({
      itemType: 'submit-report',
      retryCount: 1,
    });
  });
});

async function createFixture(attachmentInput?: SharedExecutionPhotoAttachment) {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-evidence-upload-orchestrator-'));
  createdDirectories.push(tempDirectory);
  const runtime = await bootstrapLocalDatabase(
    () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
    () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
  );
  openRuntimes.push(runtime);

  const localFile = join(tempDirectory, 'field-photo.jpg');
  writeFileSync(localFile, 'fake-jpeg-binary');
  const attachment: SharedExecutionPhotoAttachment = {
    ...(attachmentInput ?? buildPhotoAttachment()),
    previewUri: localFile,
  };
  const shell = buildShell(attachment);
  const store = runtime.repositories.userPartitions.forUser(connectedSession.userId);
  await saveLocalEvidence(store, shell, attachment);

  return {
    runtime,
    store,
    shell,
    attachment,
    localFile,
  };
}

function buildPhotoAttachment(
  overrides: Partial<SharedExecutionPhotoAttachment> = {},
): SharedExecutionPhotoAttachment {
  return {
    evidenceId: 'photo:20260423140500:orchestrator',
    executionStepId: 'guidance',
    fileName: 'field-photo.jpg',
    mimeType: 'image/jpeg',
    previewUri: 'field-photo.jpg',
    mediaRelativePath: 'user-technician/per-tag-report/tag-report-wp-local-001-tag-001/field-photo.jpg',
    source: 'camera',
    width: 640,
    height: 480,
    fileSize: 16,
    syncState: 'queued',
    metadataSyncedAt: null,
    serverEvidenceId: null,
    storageObjectKey: null,
    uploadAuthorizedAt: null,
    binaryUploadedAt: null,
    presenceFinalizedAt: null,
    syncIssue: null,
    createdAt: '2026-04-23T14:05:00.000Z',
    updatedAt: '2026-04-23T14:05:00.000Z',
    ...overrides,
  };
}

function buildShell(attachment: SharedExecutionPhotoAttachment): SharedExecutionShell {
  const reportId = 'tag-report:wp-local-001:tag-001';

  return {
    workPackageId: 'wp-local-001',
    workPackageTitle: 'Assigned package',
    tagId: 'tag-001',
    tagCode: 'PT-101',
    template: {
      id: 'tpl-pressure-as-found',
      title: 'Pressure as-found',
      version: '2026-04-v1',
      instrumentFamily: 'pressure transmitter',
      testPattern: 'as-found calibration check',
      calculationMode: 'deviation',
      acceptanceStyle: 'tolerance pass/fail',
      captureSummary: 'Capture pressure readings.',
      captureFields: [],
      calculationRangeOverride: null,
      conversionBasisSummary: null,
      expectedRangeSummary: null,
      checklistPrompts: [],
      checklistSteps: [],
      guidedDiagnosisPrompts: [],
      minimumSubmissionEvidence: ['readings'],
      expectedEvidence: ['supporting photo'],
      historyComparisonExpectation: 'compare last approved result',
      steps: [],
    },
    steps: [],
    progress: {
      currentStepId: 'guidance',
      visitedStepIds: ['guidance'],
      updatedAt: '2026-04-23T14:05:00.000Z',
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
      draftReportId: reportId,
      draftReportState: 'submitted-pending-sync',
      observationNotes: '',
      calculationEvidenceUpdatedAt: null,
      guidanceEvidenceUpdatedAt: null,
      photoAttachments: [attachment],
      photoEvidenceUpdatedAt: attachment.updatedAt,
    },
    report: {
      reportId,
      state: 'submitted-pending-sync',
      lifecycleState: 'Submitted - Pending Sync',
      syncState: 'queued',
      technicianName: connectedSession.displayName,
      technicianEmail: connectedSession.email,
      tagContextSummary: 'PT-101',
      executionSummary: 'Pressure as-found execution summary.',
      historySummary: 'History available.',
      draftDiagnosisSummary: 'No local diagnosis.',
      checklistOutcomes: [],
      evidenceReferences: [
        {
          label: 'as-found readings',
          requirementLevel: 'minimum',
          evidenceKind: 'structured-readings',
          satisfied: true,
          detail: 'Structured readings saved locally.',
        },
      ],
      riskFlags: [],
      reviewNotes: '',
      savedAt: '2026-04-23T14:05:00.000Z',
      submittedAt: '2026-04-23T14:06:00.000Z',
    },
  };
}

async function saveLocalEvidence(
  store: UserPartitionedLocalStore,
  shell: SharedExecutionShell,
  attachment: SharedExecutionPhotoAttachment,
): Promise<void> {
  await store.evidenceMetadata.saveEvidenceMetadata({
    evidenceId: attachment.evidenceId,
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: shell.report.reportId,
    fileName: attachment.fileName,
    mediaRelativePath: attachment.mediaRelativePath,
    mimeType: attachment.mimeType,
    payloadJson: JSON.stringify({
      kind: 'photo',
      workPackageId: shell.workPackageId,
      tagId: shell.tagId,
      templateId: shell.template.id,
      templateVersion: shell.template.version,
      draftReportId: shell.report.reportId,
      executionStepId: attachment.executionStepId,
      source: attachment.source,
      width: attachment.width,
      height: attachment.height,
      fileSize: attachment.fileSize,
      syncState: attachment.syncState,
      metadataSyncedAt: attachment.metadataSyncedAt,
      serverEvidenceId: attachment.serverEvidenceId,
      storageObjectKey: attachment.storageObjectKey,
      uploadAuthorizedAt: attachment.uploadAuthorizedAt,
      binaryUploadedAt: attachment.binaryUploadedAt,
      presenceFinalizedAt: attachment.presenceFinalizedAt,
      syncIssue: attachment.syncIssue,
    } satisfies StoredExecutionPhotoAttachmentPayload),
  });
}

async function seedReportDraftAndSubmitQueue(
  store: UserPartitionedLocalStore,
  shell: SharedExecutionShell,
): Promise<void> {
  await store.drafts.saveDraft({
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: shell.report.reportId,
    summaryText: `Submitted - Pending Sync report for ${shell.tagCode}`,
    payloadJson: JSON.stringify({
      reportId: shell.report.reportId,
      workPackageId: shell.workPackageId,
      tagId: shell.tagId,
      templateId: shell.template.id,
      templateVersion: shell.template.version,
      state: 'submitted-pending-sync',
      lifecycleState: 'Submitted - Pending Sync',
      syncState: 'queued',
      reviewNotes: shell.report.reviewNotes,
      savedAt: shell.report.savedAt,
      submittedAt: shell.report.submittedAt,
      syncIssue: null,
      syncIssueReasonCode: null,
      updatedAt: '2026-04-23T14:05:00.000Z',
    }),
  });

  const submitPayload: SubmitReportQueuePayload = {
    queueItemSchemaVersion: '2026-04-v1',
    itemType: SUBMIT_REPORT_QUEUE_ITEM_KIND,
    reportId: shell.report.reportId,
    workPackageId: shell.workPackageId,
    tagId: shell.tagId,
    templateId: shell.template.id,
    templateVersion: shell.template.version,
    localObjectReference: {
      businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
      businessObjectId: shell.report.reportId,
    },
    objectVersion: '2026-04-23T14:05:00.000Z',
    idempotencyKey:
      'submit-report:tag-report:wp-local-001:tag-001:2026-04-23T14:05:00.000Z',
    dependencyStatus: 'ready',
    retryCount: 0,
    queuedAt: '2026-04-23T14:05:00.000Z',
  };

  await store.queueItems.enqueue({
    queueItemId: buildSubmitReportQueueItemId(shell.report.reportId),
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: shell.report.reportId,
    itemKind: SUBMIT_REPORT_QUEUE_ITEM_KIND,
    payloadJson: JSON.stringify(submitPayload),
  });
}

async function seedEvidenceQueueItems(
  store: UserPartitionedLocalStore,
  shell: SharedExecutionShell,
  attachment: SharedExecutionPhotoAttachment,
  options: {
    includeMetadataQueueItem?: boolean;
    binaryDependencyStatus?: UploadEvidenceBinaryQueuePayload['dependencyStatus'];
  } = {},
): Promise<void> {
  const metadataQueueItemId = buildUploadEvidenceMetadataQueueItemId(attachment.evidenceId);
  const binaryQueueItemId = buildUploadEvidenceBinaryQueueItemId(attachment.evidenceId);

  if (options.includeMetadataQueueItem !== false) {
    const metadataPayload: UploadEvidenceMetadataQueuePayload = {
      queueItemSchemaVersion: '2026-04-v1',
      itemType: UPLOAD_EVIDENCE_METADATA_QUEUE_ITEM_KIND,
      reportId: shell.report.reportId,
      workPackageId: shell.workPackageId,
      tagId: shell.tagId,
      templateId: shell.template.id,
      templateVersion: shell.template.version,
      evidenceId: attachment.evidenceId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      executionStepId: attachment.executionStepId,
      source: attachment.source,
      localObjectReference: {
        businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
        businessObjectId: shell.report.reportId,
      },
      objectVersion: attachment.updatedAt,
      idempotencyKey: `${UPLOAD_EVIDENCE_METADATA_QUEUE_ITEM_KIND}:${attachment.evidenceId}:${attachment.updatedAt}`,
      dependencyStatus: 'ready',
      retryCount: 0,
      queuedAt: attachment.updatedAt,
    };

    await store.queueItems.enqueue({
      queueItemId: metadataQueueItemId,
      businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
      businessObjectId: shell.report.reportId,
      itemKind: UPLOAD_EVIDENCE_METADATA_QUEUE_ITEM_KIND,
      payloadJson: JSON.stringify(metadataPayload),
    });
  }

  const binaryPayload: UploadEvidenceBinaryQueuePayload = {
    queueItemSchemaVersion: '2026-04-v1',
    itemType: UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND,
    reportId: shell.report.reportId,
    evidenceId: attachment.evidenceId,
    mediaRelativePath: attachment.mediaRelativePath,
    mimeType: attachment.mimeType,
    executionStepId: attachment.executionStepId,
    localObjectReference: {
      businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
      businessObjectId: shell.report.reportId,
    },
    objectVersion: attachment.updatedAt,
    idempotencyKey: `${UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND}:${attachment.evidenceId}:${attachment.updatedAt}`,
    dependsOnQueueItemId: metadataQueueItemId,
    dependencyStatus: options.binaryDependencyStatus ?? 'waiting-on-evidence-metadata',
    retryCount: 0,
    queuedAt: attachment.updatedAt,
  };

  await store.queueItems.enqueue({
    queueItemId: binaryQueueItemId,
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: shell.report.reportId,
    itemKind: UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND,
    payloadJson: JSON.stringify(binaryPayload),
  });
}

async function loadPhotoPayload(
  store: UserPartitionedLocalStore,
  evidenceId: string,
): Promise<StoredExecutionPhotoAttachmentPayload> {
  const record = await store.evidenceMetadata.getEvidenceById(evidenceId);
  if (!record) {
    throw new Error(`Expected evidence metadata ${evidenceId} to exist.`);
  }

  return JSON.parse(record.payloadJson) as StoredExecutionPhotoAttachmentPayload;
}

async function loadReportDraftPayload(
  store: UserPartitionedLocalStore,
  reportId: string,
): Promise<Record<string, unknown>> {
  const record = await store.drafts.getDraft({
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: reportId,
  });
  if (!record) {
    throw new Error(`Expected report draft ${reportId} to exist.`);
  }

  return JSON.parse(record.payloadJson) as Record<string, unknown>;
}

async function loadSubmitQueuePayload(
  store: UserPartitionedLocalStore,
  reportId: string,
): Promise<SubmitReportQueuePayload | null> {
  const record = await store.queueItems.getQueueItemById(buildSubmitReportQueueItemId(reportId));
  return record ? (JSON.parse(record.payloadJson) as SubmitReportQueuePayload) : null;
}

async function listEvidenceQueuePayloads(store: UserPartitionedLocalStore, reportId: string) {
  const queueItems = await store.queueItems.listQueueItemsByBusinessObject({
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: reportId,
  });

  return queueItems
    .filter(
      (item) =>
        item.itemKind === UPLOAD_EVIDENCE_METADATA_QUEUE_ITEM_KIND ||
        item.itemKind === UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND,
    )
    .map((item) => JSON.parse(item.payloadJson));
}

function isMetadataPayload(
  value: unknown,
): value is UploadEvidenceMetadataQueuePayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { itemType?: string }).itemType === UPLOAD_EVIDENCE_METADATA_QUEUE_ITEM_KIND
  );
}

function isBinaryPayload(value: unknown): value is UploadEvidenceBinaryQueuePayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { itemType?: string }).itemType === UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND
  );
}

function shellRuntimeUserPartitions(store: UserPartitionedLocalStore): UserPartitionedLocalStoreFactory {
  return {
    forUser(ownerUserId: string) {
      expect(ownerUserId).toBe(connectedSession.userId);
      return store;
    },
  } as unknown as UserPartitionedLocalStoreFactory;
}
