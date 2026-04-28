import type { UserOwnedDraftRecord, UserOwnedEvidenceMetadataRecord, UserOwnedQueueItemRecord } from '../../data/local/repositories/userPartitionedLocalTypes';
import type { UserPartitionedLocalStoreFactory } from '../../data/local/repositories/userPartitionedLocalStoreFactory';
import type { ActiveUserSession } from '../auth/model';
import type {
  SharedExecutionReportLifecycleState,
  SharedExecutionReportState,
  SharedExecutionShell,
  SharedExecutionSyncState,
} from '../execution/model';
import type { SharedExecutionShellService } from '../execution/sharedExecutionShellService';
import type { LocalAssignedWorkPackageSummary } from '../work-packages/model';
import type { EvidenceUploadOrchestrator } from './evidenceUploadOrchestrator';
import {
  LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
  SUBMIT_REPORT_QUEUE_ITEM_KIND,
  UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND,
  UPLOAD_EVIDENCE_METADATA_QUEUE_ITEM_KIND,
} from './queueContracts';
import {
  buildSyncStateBadgeModel,
  isSharedExecutionSyncState,
  resolveAggregateSyncState,
} from './syncStateModel';

interface SyncStateServiceDependencies {
  userPartitions: UserPartitionedLocalStoreFactory;
  executionShellService: Pick<SharedExecutionShellService, 'loadShell'>;
  evidenceUploadOrchestrator: Pick<
    EvidenceUploadOrchestrator,
    'syncSubmittedReportEvidence' | 'refreshReportServerStatus'
  >;
}

interface StoredReportSyncPayload {
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  state: SharedExecutionReportState;
  lifecycleState: SharedExecutionReportLifecycleState;
  syncState: SharedExecutionSyncState;
  syncIssue?: string | null;
  updatedAt: string;
}

export interface ReportSyncDetail {
  reportId: string;
  workPackageId: string;
  syncState: SharedExecutionSyncState;
  label: string;
  detail: string;
  queueItemCount: number;
  retryableQueueItemCount: number;
  issueCount: number;
  canRetry: boolean;
}

export interface WorkPackageSyncSummary {
  workPackageId: string;
  syncState: SharedExecutionSyncState;
  label: string;
  detail: string;
  reportCount: number;
  queueItemCount: number;
  issueCount: number;
}

export interface SyncRetrySummary {
  attempted: number;
  succeeded: number;
  failed: number;
}

export class SyncStateService {
  constructor(private readonly dependencies: SyncStateServiceDependencies) {}

  async listWorkPackageSyncSummaries(
    session: ActiveUserSession,
    workPackages: LocalAssignedWorkPackageSummary[],
  ): Promise<Record<string, WorkPackageSyncSummary>> {
    const store = this.dependencies.userPartitions.forUser(session.userId);
    const drafts = await store.drafts.listDrafts();
    const parsedReports = drafts
      .map(parseStoredReportSyncPayload)
      .filter((report): report is StoredReportSyncPayload => report !== null);
    const summaries: Record<string, WorkPackageSyncSummary> = {};

    for (const workPackage of workPackages) {
      const reports = parsedReports.filter((report) => report.workPackageId === workPackage.id);
      const reportSummaries = await Promise.all(
        reports.map(async (report) => {
          const identity = {
            businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
            businessObjectId: report.reportId,
          };
          const [queueItems, evidenceRecords] = await Promise.all([
            store.queueItems.listQueueItemsByBusinessObject(identity),
            store.evidenceMetadata.listEvidenceByBusinessObject(identity),
          ]);
          const evidenceStates = evidenceRecords
            .map(parseEvidenceSyncState)
            .filter((state): state is SharedExecutionSyncState => state !== null);

          return {
            syncState: resolveAggregateSyncState([report.syncState, ...evidenceStates]),
            queueItemCount: queueItems.length,
            issueCount:
              (report.syncState === 'sync-issue' ? 1 : 0) +
              evidenceStates.filter((state) => state === 'sync-issue').length,
          };
        }),
      );
      const syncState = resolveAggregateSyncState(
        reportSummaries.map((summary) => summary.syncState),
      );
      const badge = buildSyncStateBadgeModel(syncState);

      summaries[workPackage.id] = {
        workPackageId: workPackage.id,
        syncState,
        label: badge.label,
        detail: badge.detail,
        reportCount: reports.length,
        queueItemCount: reportSummaries.reduce(
          (total, summary) => total + summary.queueItemCount,
          0,
        ),
        issueCount: reportSummaries.reduce((total, summary) => total + summary.issueCount, 0),
      };
    }

    return summaries;
  }

  async getReportSyncDetail(
    session: ActiveUserSession,
    shell: SharedExecutionShell,
  ): Promise<ReportSyncDetail> {
    const store = this.dependencies.userPartitions.forUser(session.userId);
    const identity = {
      businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
      businessObjectId: shell.report.reportId,
    };
    const [queueItems, evidenceRecords] = await Promise.all([
      store.queueItems.listQueueItemsByBusinessObject(identity),
      store.evidenceMetadata.listEvidenceByBusinessObject(identity),
    ]);
    const evidenceRecordStates = evidenceRecords
      .map(parseEvidenceSyncState)
      .filter((state): state is SharedExecutionSyncState => state !== null);
    const attachmentStates = shell.evidence.photoAttachments.map(
      (attachment) => attachment.syncState,
    );
    const issueDetail =
      shell.report.syncState === 'sync-issue' && shell.report.syncIssue
        ? shell.report.syncIssue
        : shell.evidence.photoAttachments.find(
            (attachment) => attachment.syncState === 'sync-issue' && attachment.syncIssue,
          )?.syncIssue ?? null;
    const syncState = resolveAggregateSyncState([
      shell.report.syncState,
      ...attachmentStates,
      ...evidenceRecordStates,
    ]);
    const badge = buildSyncStateBadgeModel(syncState, issueDetail);
    const retryableQueueItemCount = queueItems.filter(isRetryableEvidenceQueueItem).length;
    const issueCount =
      (shell.report.syncState === 'sync-issue' ? 1 : 0) +
      attachmentStates.filter((state) => state === 'sync-issue').length +
      evidenceRecordStates.filter((state) => state === 'sync-issue').length;

    return {
      reportId: shell.report.reportId,
      workPackageId: shell.workPackageId,
      syncState,
      label: badge.label,
      detail: badge.detail,
      queueItemCount: queueItems.length,
      retryableQueueItemCount,
      issueCount,
      canRetry:
        session.connectionMode === 'connected' &&
        shell.report.state === 'submitted-pending-sync' &&
        retryableQueueItemCount > 0,
    };
  }

  async retryReportSync(
    session: ActiveUserSession,
    shell: SharedExecutionShell,
  ): Promise<SharedExecutionShell> {
    const detail = await this.getReportSyncDetail(session, shell);

    if (!detail.canRetry) {
      return shell;
    }

    await this.dependencies.evidenceUploadOrchestrator.syncSubmittedReportEvidence(session, shell);

    return (
      (await this.dependencies.executionShellService.loadShell(
        session,
        shell.workPackageId,
        shell.tagId,
        shell.template.id,
      )) ?? shell
    );
  }

  async refreshReportServerStatus(
    session: ActiveUserSession,
    shell: SharedExecutionShell,
  ): Promise<SharedExecutionShell> {
    if (session.connectionMode !== 'connected') {
      return shell;
    }

    await this.dependencies.evidenceUploadOrchestrator.refreshReportServerStatus(session, shell);

    return (
      (await this.dependencies.executionShellService.loadShell(
        session,
        shell.workPackageId,
        shell.tagId,
        shell.template.id,
      )) ?? shell
    );
  }

  async retryEligibleReports(session: ActiveUserSession): Promise<SyncRetrySummary> {
    if (session.connectionMode !== 'connected') {
      return {
        attempted: 0,
        succeeded: 0,
        failed: 0,
      };
    }

    const store = this.dependencies.userPartitions.forUser(session.userId);
    const drafts = await store.drafts.listDrafts();
    const submittedReports = drafts
      .map(parseStoredReportSyncPayload)
      .filter(
        (report): report is StoredReportSyncPayload =>
          report !== null && report.state === 'submitted-pending-sync',
      );
    const summary: SyncRetrySummary = {
      attempted: 0,
      succeeded: 0,
      failed: 0,
    };

    for (const report of submittedReports) {
      const shell = await this.dependencies.executionShellService.loadShell(
        session,
        report.workPackageId,
        report.tagId,
        report.templateId,
      );

      if (!shell) {
        continue;
      }

      const detail = await this.getReportSyncDetail(session, shell);
      if (!detail.canRetry) {
        continue;
      }

      summary.attempted += 1;

      try {
        await this.retryReportSync(session, shell);
        summary.succeeded += 1;
      } catch {
        summary.failed += 1;
      }
    }

    return summary;
  }
}

function parseStoredReportSyncPayload(
  draft: UserOwnedDraftRecord,
): StoredReportSyncPayload | null {
  if (draft.businessObjectType !== LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE) {
    return null;
  }

  try {
    const parsed = JSON.parse(draft.payloadJson) as Partial<StoredReportSyncPayload>;
    if (
      typeof parsed.reportId !== 'string' ||
      typeof parsed.workPackageId !== 'string' ||
      typeof parsed.tagId !== 'string' ||
      typeof parsed.templateId !== 'string' ||
      typeof parsed.templateVersion !== 'string' ||
      (parsed.state !== 'technician-owned-draft' &&
        parsed.state !== 'submitted-pending-sync' &&
        parsed.state !== 'submitted-pending-review') ||
      !isSharedExecutionLifecycleState(parsed.lifecycleState) ||
      !isSharedExecutionSyncState(parsed.syncState) ||
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
      lifecycleState: parsed.lifecycleState,
      syncState: parsed.syncState,
      syncIssue:
        typeof parsed.syncIssue === 'string' || parsed.syncIssue === null
          ? parsed.syncIssue
          : undefined,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

function parseEvidenceSyncState(
  record: UserOwnedEvidenceMetadataRecord,
): SharedExecutionSyncState | null {
  try {
    const parsed = JSON.parse(record.payloadJson) as { syncState?: unknown };
    return isSharedExecutionSyncState(parsed.syncState) ? parsed.syncState : null;
  } catch {
    return null;
  }
}

function isRetryableEvidenceQueueItem(queueItem: UserOwnedQueueItemRecord): boolean {
  if (
    queueItem.itemKind !== UPLOAD_EVIDENCE_METADATA_QUEUE_ITEM_KIND &&
    queueItem.itemKind !== UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND &&
    queueItem.itemKind !== SUBMIT_REPORT_QUEUE_ITEM_KIND
  ) {
    return false;
  }

  try {
    const parsed = JSON.parse(queueItem.payloadJson) as { dependencyStatus?: unknown };
    return (
      queueItem.itemKind === UPLOAD_EVIDENCE_METADATA_QUEUE_ITEM_KIND ||
      queueItem.itemKind === SUBMIT_REPORT_QUEUE_ITEM_KIND ||
      parsed.dependencyStatus === 'ready'
    );
  } catch {
    return false;
  }
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
