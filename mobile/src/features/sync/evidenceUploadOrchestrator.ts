import type { ActiveUserSession } from '../auth/model';
import type {
  SharedExecutionApprovalHistoryItem,
  SharedExecutionPhotoAttachment,
  SharedExecutionReportLifecycleState,
  SharedExecutionReportState,
  SharedExecutionShell,
  SharedExecutionSyncState,
  StoredExecutionPhotoAttachmentPayload,
} from '../execution/model';
import type { UserOwnedDraftRecord, UserOwnedEvidenceMetadataRecord } from '../../data/local/repositories/userPartitionedLocalTypes';
import type { UserPartitionedLocalStoreFactory } from '../../data/local/repositories/userPartitionedLocalStoreFactory';
import type { LocalWorkStateRepository } from '../../data/local/repositories/localWorkStateRepository';
import type { EvidenceBinaryUploadBoundary } from '../../platform/files/evidenceBinaryUploadBoundary';
import {
  EVIDENCE_SYNC_API_CONTRACT_VERSION,
  EvidenceUploadApiError,
  REPORT_SUBMISSION_API_CONTRACT_VERSION,
  type AiDiagnosisRequestResponse,
  type EvidenceUploadApiClient,
  type ReportSubmissionAiDiagnosisProjection,
  type ReportSubmissionStatusResponse,
  type ReportSubmissionRequest,
  type ReportSubmissionSyncIssue,
} from './evidenceUploadApiClient';
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

interface EvidenceUploadOrchestratorDependencies {
  userPartitions: UserPartitionedLocalStoreFactory;
  apiClient: EvidenceUploadApiClient;
  binaryUploadBoundary: EvidenceBinaryUploadBoundary;
  localWorkState?: LocalWorkStateRepository;
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
    // 'submitted-pending-review' stays retry-eligible: the backend can
    // accept a report while individual photo uploads still fail, and those
    // photos must remain retryable after acceptance. Re-running the submit
    // phase is safe because submitReportForServerValidation no-ops once the
    // submit queue item is gone, and processAttachment skips photos that
    // already finalized server presence.
    if (
      session.connectionMode !== 'connected' ||
      (shell.report.state !== 'submitted-pending-sync' &&
        shell.report.state !== 'submitted-pending-review')
    ) {
      return;
    }

    const store = this.dependencies.userPartitions.forUser(session.userId);

    // Per-attachment failures must not block the report submission. The backend
    // accepts a report with photos whose binaries arrive later; per-photo errors
    // already surface on the photo's own `syncState` / `syncIssue` so the user
    // can retry photos independently. Without this guard, a single failing
    // attachment (transient network blip, mid-upload disconnect, MinIO
    // credential rotation) would throw out of this loop and the report would
    // never reach the server. See Story 8.7 Finding #11.
    const attachmentFailures: unknown[] = [];
    for (const attachment of shell.evidence.photoAttachments) {
      try {
        await this.processAttachment(store, shell, attachment);
      } catch (attachmentError) {
        attachmentFailures.push(attachmentError);
      }
    }

    await this.submitReportForServerValidation(store, shell);

    // When the report was already accepted server-side, the submit phase
    // above no-ops (the submit queue item was deleted at acceptance) and
    // never runs the post-acceptance promotion. Promote photos whose
    // presence finalized during this retry pass to 'synced' here so a
    // successful per-photo retry does not leave them stuck in
    // 'pending-validation'.
    if (shell.report.state === 'submitted-pending-review') {
      await markFinalizedPhotoRecordsSynced(store, shell.report.reportId);
    }

    // Story 8.12 finding #2 / N-3: previously this rethrew the first
    // per-photo failure, but the report itself was already accepted by
    // the server. The user then saw a global "sync error" toast even
    // though their report had arrived at the supervisor. Per-photo
    // failures are already recorded on each photo's own `syncIssue`
    // field and can be retried independently from the photo card.
    // Swallow the per-attachment failures here so the caller's catch
    // path is not triggered when the report itself succeeded.
    if (attachmentFailures.length > 0 && typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn(
        `Report ${shell.report.reportId} submitted but ${attachmentFailures.length} photo upload(s) need retry; see per-photo syncIssue.`,
      );
    }
  }

  async refreshReportServerStatus(
    session: ActiveUserSession,
    shell: SharedExecutionShell,
  ): Promise<ReportSubmissionAiDiagnosisProjection | null> {
    if (session.connectionMode !== 'connected') {
      return null;
    }

    const status = await this.dependencies.apiClient.getReportSubmissionStatus(
      shell.report.reportId,
    );
    const store = this.dependencies.userPartitions.forUser(session.userId);
    // Story 8.12 finding #2: when the supervisor returns the report,
    // stamp `invalidated: true` plus the supervisor's return comment so
    // the technician cannot keep editing the same draft. The next time
    // they open the tag, a fresh draft is minted.
    const invalidated =
      status.reportState === 'returned-by-supervisor' ||
      status.reportState === 'returned-by-manager';
    const invalidationReason = invalidated
      ? resolveInvalidationReason(status.approvalHistory)
      : null;
    await updateReportDraftRecord(store, shell, {
      state: mapServerReportStateToLocal(status.reportState),
      lifecycleState: status.lifecycleState,
      syncState: status.syncState,
      syncIssue: null,
      syncIssueReasonCode: null,
      approvalHistory: status.approvalHistory,
      invalidated,
      invalidationReason,
      updatedAt: status.acceptedAt || this.now().toISOString(),
    });
    // Story 11.3 (issue #1): when the report flips to a returned state,
    // purge the local execution rows for this (tag, template) tuple so
    // the technician starts from scratch on re-open. The draft record
    // itself stays (it carries `invalidated:true`, the supervisor's
    // return comment and the approval history as context), but the
    // calculation result, evidence step rows, progress pointer and the
    // per-tag photo metadata are all wiped. The mobile shell rehydrates
    // from empty stores on the next loadShell call.
    if (invalidated) {
      await purgeLocalExecutionStateForTuple(store, shell);
    }
    // Story 8.9 D-01: return the AI diagnosis projection so TagWiseApp can
    // refresh its in-memory state. AI flows back via the same status fetch.
    return status.aiDiagnosis;
  }

  /**
   * Story 8.9 D-01: request a manual AI diagnosis for the given report. The
   * backend enqueues a worker job and returns the current AI projection
   * (typically state='pending'). Errors propagate as
   * `EvidenceUploadApiError`; the caller is responsible for surfacing the
   * failure as a non-blocking UX notice.
   */
  async requestAiDiagnosis(
    session: ActiveUserSession,
    reportId: string,
  ): Promise<AiDiagnosisRequestResponse> {
    if (session.connectionMode !== 'connected') {
      throw new EvidenceUploadApiError(
        'Conexao obrigatoria para solicitar diagnostico assistido.',
        0,
        'network',
      );
    }
    return this.dependencies.apiClient.requestAiDiagnosis(reportId);
  }

  private async submitReportForServerValidation(
    store: ReturnType<UserPartitionedLocalStoreFactory['forUser']>,
    shell: SharedExecutionShell,
  ): Promise<void> {
    const submitQueueItemId = buildSubmitReportQueueItemId(shell.report.reportId);
    const submitQueueItem = await store.queueItems.getQueueItemById(submitQueueItemId);
    if (!submitQueueItem) {
      return;
    }

    const pendingAt = this.now().toISOString();
    const submitPayload = parseSubmitReportQueuePayload(submitQueueItem.payloadJson);
    if (!submitPayload) {
      const message = 'Report submission queue payload is malformed and needs local recovery.';
      await bumpQueueRetryCount(store, submitQueueItemId);
      await updateReportDraftRecord(store, shell, {
        state: 'submitted-pending-sync',
        lifecycleState: 'Submitted - Pending Sync',
        syncState: 'sync-issue',
        syncIssue: message,
        syncIssueReasonCode: 'malformed-report-payload',
        updatedAt: pendingAt,
      });
      throw new Error(message);
    }

    await updateReportDraftRecord(store, shell, {
      state: 'submitted-pending-sync',
      lifecycleState: 'Submitted - Pending Sync',
      syncState: 'pending-validation',
      syncIssue: null,
      syncIssueReasonCode: null,
      updatedAt: pendingAt,
    });

    try {
      const accepted = await this.dependencies.apiClient.submitReportForValidation(
        await buildReportSubmissionRequest(store, shell, submitPayload),
      );
      const acceptedAt = accepted.acceptedAt || this.now().toISOString();

      await updateReportDraftRecord(store, shell, {
        state: mapServerReportStateToLocal(accepted.reportState),
        lifecycleState: accepted.lifecycleState,
        syncState: accepted.syncState,
        syncIssue: null,
        syncIssueReasonCode: null,
        updatedAt: acceptedAt,
      });
      await markFinalizedPhotoRecordsSynced(store, shell.report.reportId);
      await store.queueItems.deleteQueueItem(submitQueueItemId);
      await decrementUnsyncedWorkCount(this.dependencies.localWorkState);
    } catch (error) {
      const syncIssue = error instanceof EvidenceUploadApiError ? error.syncIssue : null;
      await bumpQueueRetryCount(store, submitQueueItemId);
      await updateReportDraftRecord(store, shell, {
        state: 'submitted-pending-sync',
        lifecycleState: 'Submitted - Pending Sync',
        syncState: 'sync-issue',
        syncIssue:
          syncIssue?.message ??
          (error instanceof Error ? error.message : 'Report submission validation failed.'),
        syncIssueReasonCode: syncIssue?.reasonCode ?? null,
        updatedAt: this.now().toISOString(),
      });
      throw error;
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

    const currentPayload = parsePhotoAttachmentPayload(metadataRecord.payloadJson);
    if (!currentPayload) {
      throw new Error(`Unsupported evidence metadata payload for ${attachment.evidenceId}.`);
    }

    if (currentPayload.presenceFinalizedAt) {
      await store.queueItems.deleteQueueItem(metadataQueueItemId);
      await store.queueItems.deleteQueueItem(binaryQueueItemId);
      return;
    }

    if (currentPayload.metadataSyncedAt && currentPayload.serverEvidenceId) {
      await store.queueItems.deleteQueueItem(metadataQueueItemId);
    }

    if (!currentPayload.metadataSyncedAt || !currentPayload.serverEvidenceId) {
      await ensureMetadataQueueItem(store, shell, attachment, metadataQueueItemId);
      const metadataQueueItem = await store.queueItems.getQueueItemById(metadataQueueItemId);

      try {
        const synced = await this.dependencies.apiClient.syncEvidenceMetadata({
          contractVersion: EVIDENCE_SYNC_API_CONTRACT_VERSION,
          reportId: shell.report.reportId,
          workPackageId: shell.workPackageId,
          tagId: shell.tagId,
          templateId: shell.template.id,
          templateVersion: shell.template.version,
          evidenceId: attachment.evidenceId,
          fileName: attachment.fileName,
          // Attach-time hardening defaults the mime type for new photos;
          // this fallback covers attachments persisted before that fix so
          // the backend does not 400 on a null declared file type.
          mimeType: attachment.mimeType ?? 'image/jpeg',
          fileSizeBytes: attachment.fileSize ?? 0,
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
        if (isPermanentEvidenceMetadataRejection(error)) {
          await store.queueItems.deleteQueueItem(binaryQueueItemId);
        }
        throw error;
      }
    }

    const refreshedMetadataRecord = await store.evidenceMetadata.getEvidenceById(attachment.evidenceId);
    if (!refreshedMetadataRecord) {
      throw new Error(`Missing refreshed evidence metadata for ${attachment.evidenceId}.`);
    }
    const refreshedPayload = parsePhotoAttachmentPayload(refreshedMetadataRecord.payloadJson);
    if (refreshedPayload?.presenceFinalizedAt) {
      await store.queueItems.deleteQueueItem(metadataQueueItemId);
      await store.queueItems.deleteQueueItem(binaryQueueItemId);
      return;
    }

    if (!refreshedPayload?.serverEvidenceId) {
      return;
    }

    await ensureBinaryQueueItem(store, shell, attachment, binaryQueueItemId);

    try {
      const authorization = await this.dependencies.apiClient.authorizeEvidenceBinaryUpload({
        contractVersion: EVIDENCE_SYNC_API_CONTRACT_VERSION,
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
        contractVersion: EVIDENCE_SYNC_API_CONTRACT_VERSION,
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
      const latestMetadataRecord =
        (await store.evidenceMetadata.getEvidenceById(attachment.evidenceId)) ??
        refreshedMetadataRecord;
      await updatePhotoMetadataRecord(store, latestMetadataRecord, (payload) => ({
        ...payload,
        syncState: 'sync-issue',
        syncIssue: error instanceof Error ? error.message : 'Evidence binary upload failed.',
      }));
      throw error;
    }
  }
}

interface StoredReportSubmissionDraftPayload {
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  state: SharedExecutionReportState;
  lifecycleState?: SharedExecutionReportLifecycleState;
  syncState?: SharedExecutionSyncState;
  approvalHistory?: {
    items: SharedExecutionApprovalHistoryItem[];
    placeholder: string;
  };
  reviewNotes?: string;
  savedAt?: string | null;
  submittedAt?: string | null;
  syncIssue?: string | null;
  syncIssueReasonCode?: string | null;
  // Story 8.12 finding #2: when the server reports the supervisor
  // returned the draft, persist that as an `invalidated` flag plus the
  // supervisor's comment so the technician sees a read-only history
  // entry and is forced to start a fresh visit on the next open.
  invalidated?: boolean;
  invalidationReason?: string | null;
  updatedAt: string;
}

async function buildReportSubmissionRequest(
  store: ReturnType<UserPartitionedLocalStoreFactory['forUser']>,
  shell: SharedExecutionShell,
  submitPayload: SubmitReportQueuePayload,
): Promise<ReportSubmissionRequest> {
  const photoAttachments = await loadPhotoSubmissionAttachments(store, shell.report.reportId);

  return {
    contractVersion: REPORT_SUBMISSION_API_CONTRACT_VERSION,
    reportId: shell.report.reportId,
    workPackageId: shell.workPackageId,
    tagId: shell.tagId,
    templateId: shell.template.id,
    templateVersion: shell.template.version,
    reportState: 'submitted-pending-sync',
    lifecycleState: 'Submitted - Pending Sync',
    syncState: 'pending-validation',
    objectVersion: submitPayload.objectVersion,
    idempotencyKey: submitPayload.idempotencyKey,
    submittedAt: shell.report.submittedAt ?? submitPayload.queuedAt,
    executionSummary: shell.report.executionSummary,
    historySummary: shell.report.historySummary,
    draftDiagnosisSummary: shell.report.draftDiagnosisSummary,
    evidenceReferences: shell.report.evidenceReferences,
    riskFlags: shell.report.riskFlags.map((item) => ({
      id: item.id,
      reasonType: item.reasonType,
      justificationRequired: item.justificationRequired,
      justificationText: item.justificationText,
    })),
    photoAttachments,
  };
}

async function decrementUnsyncedWorkCount(
  localWorkState: LocalWorkStateRepository | undefined,
): Promise<void> {
  if (!localWorkState) {
    return;
  }

  const currentUnsyncedCount = await localWorkState.getUnsyncedWorkCount();
  await localWorkState.setUnsyncedWorkCount(currentUnsyncedCount - 1);
}

async function loadPhotoSubmissionAttachments(
  store: ReturnType<UserPartitionedLocalStoreFactory['forUser']>,
  reportId: string,
): Promise<ReportSubmissionRequest['photoAttachments']> {
  const records = await store.evidenceMetadata.listEvidenceByBusinessObject({
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: reportId,
  });
  const attachments: ReportSubmissionRequest['photoAttachments'] = [];

  for (const record of records) {
    const payload = parsePhotoAttachmentPayload(record.payloadJson);
    if (!payload) {
      continue;
    }

    attachments.push({
      evidenceId: record.evidenceId,
      serverEvidenceId: payload.serverEvidenceId ?? null,
      presenceFinalizedAt: payload.presenceFinalizedAt ?? null,
      syncState: payload.syncState ?? 'local-only',
      // Story 8.8 D-02 / D-04: round-trip per-photo execution context label and
      // technician observation through the submission DTO. Backend stores the
      // entire request payload as JSON, so these fields persist without a
      // schema migration; supervisor read path surfaces them via the same
      // payload.photoAttachments array.
      contextNote: payload.contextNote ?? null,
      executionStepId: payload.executionStepId ?? null,
      technicianNote: payload.technicianNote ?? null,
    });
  }

  return attachments;
}

// Story 11.3 (issue #1): clear every local execution-state row for the
// returned (workPackageId, tagId, templateId, templateVersion) tuple so
// the next loadShell rehydrates an "empty" shell as if the test was
// never run. The draft itself is preserved upstream (it carries the
// supervisor's return comment + the approval history). Per-tag photo
// metadata is wiped via the businessObjectId 'tag-report:{wp}:{tag}'
// pattern so the supervisor's previously-attached evidence does not
// linger on the re-execution screen.
async function purgeLocalExecutionStateForTuple(
  store: ReturnType<UserPartitionedLocalStoreFactory['forUser']>,
  shell: SharedExecutionShell,
): Promise<void> {
  const { workPackageId, tagId, template } = shell;
  await Promise.all([
    store.executionCalculations.deleteForTagTemplate(
      workPackageId,
      tagId,
      template.id,
      template.version,
    ),
    store.executionEvidence.deleteForTagTemplate(
      workPackageId,
      tagId,
      template.id,
      template.version,
    ),
    store.executionProgress.deleteForTagTemplate(
      workPackageId,
      tagId,
      template.id,
      template.version,
    ),
  ]);

  // Photo metadata is per-tag (not per-template); we wipe every
  // attachment tied to this tag's report so the re-execution screen
  // starts with zero photos. The technician re-takes whatever the
  // supervisor's comment asks for.
  const businessObjectId = `tag-report:${workPackageId}:${tagId}`;
  const photoRecords = await store.evidenceMetadata.listEvidenceByBusinessObject({
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId,
  });
  await Promise.all(
    photoRecords.map((record) =>
      store.evidenceMetadata.deleteEvidenceMetadata(record.evidenceId),
    ),
  );
}

async function updateReportDraftRecord(
  store: ReturnType<UserPartitionedLocalStoreFactory['forUser']>,
  shell: SharedExecutionShell,
  input: {
    state: StoredReportSubmissionDraftPayload['state'];
    lifecycleState: NonNullable<StoredReportSubmissionDraftPayload['lifecycleState']>;
    syncState: SharedExecutionSyncState;
    syncIssue: string | null;
    syncIssueReasonCode: ReportSubmissionSyncIssue['reasonCode'] | null;
    approvalHistory?: ReportSubmissionStatusResponse['approvalHistory'];
    // Story 8.12 finding #2: optional flags so the refresh-status path
    // can stamp an invalidated draft. Other paths leave them undefined
    // and the previously-persisted values stick.
    invalidated?: boolean;
    invalidationReason?: string | null;
    updatedAt: string;
  },
): Promise<void> {
  const draft = await store.drafts.getDraft({
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: shell.report.reportId,
  });
  if (!draft) {
    throw new Error(`Missing local report draft for ${shell.report.reportId}.`);
  }

  const payload = parseReportSubmissionDraftPayload(draft);
  if (!payload) {
    throw new Error(`Unsupported report draft payload for ${shell.report.reportId}.`);
  }

  await store.drafts.saveDraft({
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: shell.report.reportId,
    summaryText: `${input.lifecycleState} report for ${shell.tagCode}`,
    payloadJson: JSON.stringify({
      ...payload,
      state: input.state,
      lifecycleState: input.lifecycleState,
      syncState: input.syncState,
      syncIssue: input.syncIssue,
      syncIssueReasonCode: input.syncIssueReasonCode,
      approvalHistory: input.approvalHistory ?? payload.approvalHistory,
      invalidated: input.invalidated ?? payload.invalidated,
      invalidationReason: input.invalidationReason ?? payload.invalidationReason,
      updatedAt: input.updatedAt,
    } satisfies StoredReportSubmissionDraftPayload),
  });
}

function resolveInvalidationReason(
  history: ReportSubmissionStatusResponse['approvalHistory'] | undefined,
): string | null {
  // Story 8.12 finding #2: the supervisor's return comment lives in the
  // last approval-history item whose actionType records a return. The
  // backend emits namespaced action types ('report.supervisor.returned' /
  // 'report.manager.returned'), so match the '.returned' suffix as well as
  // the bare 'returned' form. Surface it so the technician knows what to
  // fix in the new visit.
  if (!history?.items) {
    return null;
  }
  for (let index = history.items.length - 1; index >= 0; index -= 1) {
    const item = history.items[index];
    if (
      item &&
      (item.actionType === 'returned' || item.actionType.endsWith('.returned')) &&
      item.comment
    ) {
      return item.comment;
    }
  }
  return null;
}

async function markFinalizedPhotoRecordsSynced(
  store: ReturnType<UserPartitionedLocalStoreFactory['forUser']>,
  reportId: string,
): Promise<void> {
  const records = await store.evidenceMetadata.listEvidenceByBusinessObject({
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: reportId,
  });

  for (const record of records) {
    const payload = parsePhotoAttachmentPayload(record.payloadJson);
    if (!payload?.presenceFinalizedAt) {
      continue;
    }

    await updatePhotoMetadataRecord(store, record, (current) => ({
      ...current,
      syncState: 'synced',
      syncIssue: null,
    }));
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
    // Same legacy-record fallback as the syncEvidenceMetadata request above.
    mimeType: attachment.mimeType ?? 'image/jpeg',
    fileSizeBytes: attachment.fileSize ?? 0,
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
      contextNote:
        typeof parsed.contextNote === 'string' || parsed.contextNote === null
          ? parsed.contextNote
          : null,
      technicianNote:
        typeof parsed.technicianNote === 'string' || parsed.technicianNote === null
          ? parsed.technicianNote
          : null,
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

function parseSubmitReportQueuePayload(payloadJson: string): SubmitReportQueuePayload | null {
  try {
    const parsed = JSON.parse(payloadJson) as Partial<SubmitReportQueuePayload>;
    if (
      parsed.itemType !== SUBMIT_REPORT_QUEUE_ITEM_KIND ||
      typeof parsed.reportId !== 'string' ||
      typeof parsed.objectVersion !== 'string' ||
      typeof parsed.idempotencyKey !== 'string'
    ) {
      return null;
    }

    return parsed as SubmitReportQueuePayload;
  } catch {
    return null;
  }
}

function isPermanentEvidenceMetadataRejection(error: unknown): boolean {
  return (
    error instanceof EvidenceUploadApiError &&
    error.kind === 'server' &&
    error.statusCode === 400 &&
    error.message.startsWith('Evidence ')
  );
}

function parseReportSubmissionDraftPayload(
  draft: UserOwnedDraftRecord,
): StoredReportSubmissionDraftPayload | null {
  try {
    const parsed = JSON.parse(draft.payloadJson) as Partial<StoredReportSubmissionDraftPayload>;
    if (
      typeof parsed.reportId !== 'string' ||
      typeof parsed.workPackageId !== 'string' ||
      typeof parsed.tagId !== 'string' ||
      typeof parsed.templateId !== 'string' ||
      typeof parsed.templateVersion !== 'string' ||
      (parsed.state !== 'technician-owned-draft' &&
        parsed.state !== 'submitted-pending-sync' &&
        parsed.state !== 'submitted-pending-review') ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return null;
    }

    return {
      reportId: parsed.reportId,
      workPackageId: parsed.workPackageId,
      tagId: parsed.tagId,
      templateId: parsed.templateId,
      templateVersion: parsed.templateVersion,
      state: parsed.state,
      lifecycleState:
        isSharedExecutionLifecycleState(parsed.lifecycleState)
          ? parsed.lifecycleState
          : undefined,
      syncState:
        parsed.syncState === 'local-only' ||
        parsed.syncState === 'queued' ||
        parsed.syncState === 'syncing' ||
        parsed.syncState === 'pending-validation' ||
        parsed.syncState === 'synced' ||
        parsed.syncState === 'sync-issue'
          ? parsed.syncState
          : undefined,
      reviewNotes: typeof parsed.reviewNotes === 'string' ? parsed.reviewNotes : undefined,
      savedAt:
        typeof parsed.savedAt === 'string' || parsed.savedAt === null
          ? parsed.savedAt
          : undefined,
      submittedAt:
        typeof parsed.submittedAt === 'string' || parsed.submittedAt === null
          ? parsed.submittedAt
          : undefined,
      syncIssue:
        typeof parsed.syncIssue === 'string' || parsed.syncIssue === null
          ? parsed.syncIssue
          : undefined,
      syncIssueReasonCode:
        typeof parsed.syncIssueReasonCode === 'string' || parsed.syncIssueReasonCode === null
          ? parsed.syncIssueReasonCode
          : undefined,
      approvalHistory: parseApprovalHistory(parsed.approvalHistory),
      // Story 8.12 finding #2: round-trip the invalidated flag + reason
      // so the local draft remembers a supervisor return across app
      // restarts.
      invalidated: typeof parsed.invalidated === 'boolean' ? parsed.invalidated : undefined,
      invalidationReason:
        typeof parsed.invalidationReason === 'string' || parsed.invalidationReason === null
          ? parsed.invalidationReason
          : undefined,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

function mapServerReportStateToLocal(
  state: ReportSubmissionStatusResponse['reportState'],
): SharedExecutionReportState {
  if (state === 'returned-by-supervisor' || state === 'returned-by-manager') {
    return 'technician-owned-draft';
  }

  return 'submitted-pending-review';
}

function isSharedExecutionLifecycleState(
  value: unknown,
): value is SharedExecutionReportLifecycleState {
  return (
    value === 'In Progress' ||
    value === 'Ready to Submit' ||
    value === 'Submitted - Pending Sync' ||
    value === 'Submitted - Pending Supervisor Review' ||
    value === 'Escalated - Pending Manager Review' ||
    value === 'Returned by Supervisor' ||
    value === 'Returned by Manager' ||
    value === 'Approved'
  );
}

function parseApprovalHistory(value: unknown): StoredReportSubmissionDraftPayload['approvalHistory'] {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  type StoredApprovalHistory = NonNullable<StoredReportSubmissionDraftPayload['approvalHistory']>;
  const candidate = value as Partial<StoredApprovalHistory>;
  if (!Array.isArray(candidate.items)) {
    return undefined;
  }

  return {
    items: candidate.items.filter(isApprovalHistoryItem),
    placeholder: typeof candidate.placeholder === 'string' ? candidate.placeholder : '',
  };
}

function isApprovalHistoryItem(value: unknown): value is SharedExecutionApprovalHistoryItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<SharedExecutionApprovalHistoryItem>;
  return (
    typeof candidate.auditEventId === 'string' &&
    typeof candidate.actorRole === 'string' &&
    typeof candidate.actionType === 'string' &&
    typeof candidate.occurredAt === 'string' &&
    typeof candidate.correlationId === 'string' &&
    (typeof candidate.priorState === 'string' || candidate.priorState === null) &&
    (typeof candidate.nextState === 'string' || candidate.nextState === null) &&
    (typeof candidate.comment === 'string' || candidate.comment === null)
  );
}
