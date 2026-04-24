import type { ActiveUserSession } from '../auth/model';
import type {
  SharedExecutionPhotoAttachment,
  SharedExecutionShell,
  StoredExecutionPhotoAttachmentPayload,
} from '../execution/model';
import type { UserOwnedEvidenceMetadataRecord, UserOwnedQueueItemRecord } from '../../data/local/repositories/userPartitionedLocalTypes';
import type { UserPartitionedLocalStoreFactory } from '../../data/local/repositories/userPartitionedLocalStoreFactory';
import type { EvidenceBinaryUploadBoundary } from '../../platform/files/evidenceBinaryUploadBoundary';
import type { EvidenceUploadApiClient } from './evidenceUploadApiClient';
import {
  buildUploadEvidenceBinaryQueueItemId,
  buildUploadEvidenceMetadataQueueItemId,
  LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
  type UploadEvidenceBinaryQueuePayload,
  type UploadEvidenceMetadataQueuePayload,
  UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND,
  UPLOAD_EVIDENCE_METADATA_QUEUE_ITEM_KIND,
} from './queueContracts';

interface EvidenceUploadOrchestratorDependencies {
  userPartitions: UserPartitionedLocalStoreFactory;
  apiClient: EvidenceUploadApiClient;
  binaryUploadBoundary: EvidenceBinaryUploadBoundary;
  now?: () => Date;
}

export class EvidenceUploadOrchestrator {
  private readonly now: () => Date;

  constructor(private readonly dependencies: EvidenceUploadOrchestratorDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async syncSubmittedReportEvidence(
    session: ActiveUserSession,
    shell: SharedExecutionShell,
  ): Promise<void> {
    if (
      session.connectionMode !== 'connected' ||
      shell.report.state !== 'submitted-pending-sync' ||
      shell.evidence.photoAttachments.length === 0
    ) {
      return;
    }

    const store = this.dependencies.userPartitions.forUser(session.userId);

    for (const attachment of shell.evidence.photoAttachments) {
      await this.processAttachment(store, shell, attachment);
    }
  }

  private async processAttachment(
    store: ReturnType<UserPartitionedLocalStoreFactory['forUser']>,
    shell: SharedExecutionShell,
    attachment: SharedExecutionPhotoAttachment,
  ): Promise<void> {
    const metadataQueueItemId = buildUploadEvidenceMetadataQueueItemId(attachment.evidenceId);
    const binaryQueueItemId = buildUploadEvidenceBinaryQueueItemId(attachment.evidenceId);
    const metadataRecord = await store.evidenceMetadata.getEvidenceById(attachment.evidenceId);

    if (!metadataRecord) {
      throw new Error(`Missing local evidence metadata for ${attachment.evidenceId}.`);
    }

    if (!attachment.metadataSyncedAt) {
      await ensureMetadataQueueItem(store, shell, attachment, metadataQueueItemId);
      const metadataQueueItem = await store.queueItems.getQueueItemById(metadataQueueItemId);

      try {
        const synced = await this.dependencies.apiClient.syncEvidenceMetadata({
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
          localCapturedAt: attachment.createdAt,
          metadataIdempotencyKey:
            metadataQueueItem && isUploadEvidenceMetadataQueuePayload(metadataQueueItem.payloadJson)
              ? parseUploadEvidenceMetadataQueuePayload(metadataQueueItem.payloadJson)!.idempotencyKey
              : `${UPLOAD_EVIDENCE_METADATA_QUEUE_ITEM_KIND}:${attachment.evidenceId}:${attachment.updatedAt}`,
        });

        await updatePhotoMetadataRecord(store, metadataRecord, (payload) => ({
          ...payload,
          syncState: 'syncing',
          metadataSyncedAt: synced.metadataReceivedAt,
          serverEvidenceId: synced.serverEvidenceId,
          syncIssue: null,
        }));

        await store.queueItems.deleteQueueItem(metadataQueueItemId);
        await promoteBinaryQueueItemToReady(store, binaryQueueItemId);
      } catch (error) {
        await bumpQueueRetryCount(store, metadataQueueItemId);
        await updatePhotoMetadataRecord(store, metadataRecord, (payload) => ({
          ...payload,
          syncState: 'sync-issue',
          syncIssue: error instanceof Error ? error.message : 'Evidence metadata sync failed.',
        }));
        throw error;
      }
    }

    const refreshedMetadataRecord = await store.evidenceMetadata.getEvidenceById(attachment.evidenceId);
    if (!refreshedMetadataRecord) {
      throw new Error(`Missing refreshed evidence metadata for ${attachment.evidenceId}.`);
    }
    const refreshedPayload = parsePhotoAttachmentPayload(refreshedMetadataRecord.payloadJson);
    if (!refreshedPayload?.serverEvidenceId || refreshedPayload.presenceFinalizedAt) {
      return;
    }

    await ensureBinaryQueueItem(store, shell, attachment, binaryQueueItemId);

    try {
      const authorization = await this.dependencies.apiClient.authorizeEvidenceBinaryUpload({
        reportId: shell.report.reportId,
        evidenceId: attachment.evidenceId,
      });
      const authorizedAt = this.now().toISOString();

      await updatePhotoMetadataRecord(store, refreshedMetadataRecord, (payload) => ({
        ...payload,
        syncState: 'syncing',
        serverEvidenceId: authorization.serverEvidenceId,
        storageObjectKey: authorization.objectKey,
        uploadAuthorizedAt: authorizedAt,
        syncIssue: null,
      }));

      await this.dependencies.binaryUploadBoundary.uploadBinary({
        localFileUri: attachment.previewUri,
        uploadUrl: authorization.uploadUrl,
        uploadMethod: authorization.uploadMethod,
        requiredHeaders: authorization.requiredHeaders,
      });

      const finalized = await this.dependencies.apiClient.finalizeEvidenceBinaryUpload({
        serverEvidenceId: authorization.serverEvidenceId,
      });

      await updatePhotoMetadataRecord(store, refreshedMetadataRecord, (payload) => ({
        ...payload,
        syncState: 'pending-validation',
        serverEvidenceId: authorization.serverEvidenceId,
        storageObjectKey: authorization.objectKey,
        uploadAuthorizedAt: authorizedAt,
        binaryUploadedAt: finalized.presenceFinalizedAt,
        presenceFinalizedAt: finalized.presenceFinalizedAt,
        syncIssue: null,
      }));

      await store.queueItems.deleteQueueItem(binaryQueueItemId);
    } catch (error) {
      await bumpQueueRetryCount(store, binaryQueueItemId);
      await updatePhotoMetadataRecord(store, refreshedMetadataRecord, (payload) => ({
        ...payload,
        syncState: 'sync-issue',
        syncIssue: error instanceof Error ? error.message : 'Evidence binary upload failed.',
      }));
      throw error;
    }
  }
}

async function ensureMetadataQueueItem(
  store: ReturnType<UserPartitionedLocalStoreFactory['forUser']>,
  shell: SharedExecutionShell,
  attachment: SharedExecutionPhotoAttachment,
  queueItemId: string,
): Promise<void> {
  const existing = await store.queueItems.getQueueItemById(queueItemId);
  if (existing) {
    return;
  }

  const payload: UploadEvidenceMetadataQueuePayload = {
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
    queueItemId,
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: shell.report.reportId,
    itemKind: UPLOAD_EVIDENCE_METADATA_QUEUE_ITEM_KIND,
    payloadJson: JSON.stringify(payload),
  });
}

async function ensureBinaryQueueItem(
  store: ReturnType<UserPartitionedLocalStoreFactory['forUser']>,
  shell: SharedExecutionShell,
  attachment: SharedExecutionPhotoAttachment,
  queueItemId: string,
): Promise<void> {
  const existing = await store.queueItems.getQueueItemById(queueItemId);
  if (existing) {
    return;
  }

  const dependsOnQueueItemId = buildUploadEvidenceMetadataQueueItemId(attachment.evidenceId);
  const payload: UploadEvidenceBinaryQueuePayload = {
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
    dependsOnQueueItemId,
    dependencyStatus: 'waiting-on-evidence-metadata',
    retryCount: 0,
    queuedAt: attachment.updatedAt,
  };

  await store.queueItems.enqueue({
    queueItemId,
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: shell.report.reportId,
    itemKind: UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND,
    payloadJson: JSON.stringify(payload),
  });
}

async function updatePhotoMetadataRecord(
  store: ReturnType<UserPartitionedLocalStoreFactory['forUser']>,
  record: UserOwnedEvidenceMetadataRecord,
  mutate: (payload: StoredExecutionPhotoAttachmentPayload) => StoredExecutionPhotoAttachmentPayload,
): Promise<void> {
  const payload = parsePhotoAttachmentPayload(record.payloadJson);
  if (!payload) {
    throw new Error(`Unsupported evidence metadata payload for ${record.evidenceId}.`);
  }

  await store.evidenceMetadata.saveEvidenceMetadata({
    evidenceId: record.evidenceId,
    businessObjectType: record.businessObjectType,
    businessObjectId: record.businessObjectId,
    fileName: record.fileName,
    mediaRelativePath: record.mediaRelativePath,
    mimeType: record.mimeType,
    payloadJson: JSON.stringify(mutate(payload)),
  });
}

async function promoteBinaryQueueItemToReady(
  store: ReturnType<UserPartitionedLocalStoreFactory['forUser']>,
  queueItemId: string,
): Promise<void> {
  const queueItem = await store.queueItems.getQueueItemById(queueItemId);
  if (!queueItem) {
    return;
  }

  const payload = parseUploadEvidenceBinaryQueuePayload(queueItem.payloadJson);
  if (!payload) {
    return;
  }

  await store.queueItems.enqueue({
    queueItemId,
    businessObjectType: queueItem.businessObjectType,
    businessObjectId: queueItem.businessObjectId,
    itemKind: queueItem.itemKind,
    payloadJson: JSON.stringify({
      ...payload,
      dependencyStatus: 'ready',
    } satisfies UploadEvidenceBinaryQueuePayload),
  });
}

async function bumpQueueRetryCount(
  store: ReturnType<UserPartitionedLocalStoreFactory['forUser']>,
  queueItemId: string,
): Promise<void> {
  const queueItem = await store.queueItems.getQueueItemById(queueItemId);
  if (!queueItem) {
    return;
  }

  const parsed = JSON.parse(queueItem.payloadJson) as { retryCount?: number };
  await store.queueItems.enqueue({
    queueItemId,
    businessObjectType: queueItem.businessObjectType,
    businessObjectId: queueItem.businessObjectId,
    itemKind: queueItem.itemKind,
    payloadJson: JSON.stringify({
      ...(typeof parsed === 'object' && parsed ? parsed : {}),
      retryCount: typeof parsed.retryCount === 'number' ? parsed.retryCount + 1 : 1,
    }),
  });
}

function parsePhotoAttachmentPayload(
  payloadJson: string,
): StoredExecutionPhotoAttachmentPayload | null {
  try {
    const parsed = JSON.parse(payloadJson) as Partial<StoredExecutionPhotoAttachmentPayload>;
    if (
      parsed.kind !== 'photo' ||
      typeof parsed.workPackageId !== 'string' ||
      typeof parsed.tagId !== 'string' ||
      typeof parsed.templateId !== 'string' ||
      typeof parsed.templateVersion !== 'string' ||
      typeof parsed.draftReportId !== 'string' ||
      (parsed.source !== 'camera' && parsed.source !== 'library')
    ) {
      return null;
    }

    return {
      kind: 'photo',
      workPackageId: parsed.workPackageId,
      tagId: parsed.tagId,
      templateId: parsed.templateId,
      templateVersion: parsed.templateVersion,
      draftReportId: parsed.draftReportId,
      executionStepId: parsed.executionStepId ?? 'guidance',
      source: parsed.source,
      width: typeof parsed.width === 'number' ? parsed.width : null,
      height: typeof parsed.height === 'number' ? parsed.height : null,
      fileSize: typeof parsed.fileSize === 'number' ? parsed.fileSize : null,
      syncState:
        parsed.syncState === 'queued' ||
        parsed.syncState === 'syncing' ||
        parsed.syncState === 'pending-validation' ||
        parsed.syncState === 'synced' ||
        parsed.syncState === 'sync-issue' ||
        parsed.syncState === 'local-only'
          ? parsed.syncState
          : 'local-only',
      metadataSyncedAt:
        typeof parsed.metadataSyncedAt === 'string' || parsed.metadataSyncedAt === null
          ? parsed.metadataSyncedAt
          : null,
      serverEvidenceId:
        typeof parsed.serverEvidenceId === 'string' || parsed.serverEvidenceId === null
          ? parsed.serverEvidenceId
          : null,
      storageObjectKey:
        typeof parsed.storageObjectKey === 'string' || parsed.storageObjectKey === null
          ? parsed.storageObjectKey
          : null,
      uploadAuthorizedAt:
        typeof parsed.uploadAuthorizedAt === 'string' || parsed.uploadAuthorizedAt === null
          ? parsed.uploadAuthorizedAt
          : null,
      binaryUploadedAt:
        typeof parsed.binaryUploadedAt === 'string' || parsed.binaryUploadedAt === null
          ? parsed.binaryUploadedAt
          : null,
      presenceFinalizedAt:
        typeof parsed.presenceFinalizedAt === 'string' || parsed.presenceFinalizedAt === null
          ? parsed.presenceFinalizedAt
          : null,
      syncIssue:
        typeof parsed.syncIssue === 'string' || parsed.syncIssue === null
          ? parsed.syncIssue
          : null,
    };
  } catch {
    return null;
  }
}

function isUploadEvidenceMetadataQueuePayload(payloadJson: string): boolean {
  return parseUploadEvidenceMetadataQueuePayload(payloadJson) !== null;
}

function parseUploadEvidenceMetadataQueuePayload(
  payloadJson: string,
): UploadEvidenceMetadataQueuePayload | null {
  try {
    const parsed = JSON.parse(payloadJson) as Partial<UploadEvidenceMetadataQueuePayload>;
    if (
      parsed.itemType !== UPLOAD_EVIDENCE_METADATA_QUEUE_ITEM_KIND ||
      typeof parsed.reportId !== 'string' ||
      typeof parsed.evidenceId !== 'string' ||
      typeof parsed.idempotencyKey !== 'string'
    ) {
      return null;
    }

    return parsed as UploadEvidenceMetadataQueuePayload;
  } catch {
    return null;
  }
}

function parseUploadEvidenceBinaryQueuePayload(
  payloadJson: string,
): UploadEvidenceBinaryQueuePayload | null {
  try {
    const parsed = JSON.parse(payloadJson) as Partial<UploadEvidenceBinaryQueuePayload>;
    if (
      parsed.itemType !== UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND ||
      typeof parsed.reportId !== 'string' ||
      typeof parsed.evidenceId !== 'string'
    ) {
      return null;
    }

    return parsed as UploadEvidenceBinaryQueuePayload;
  } catch {
    return null;
  }
}
