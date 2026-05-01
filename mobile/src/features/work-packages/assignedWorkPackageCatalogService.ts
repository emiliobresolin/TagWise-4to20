import type { ActiveUserSession } from '../auth/model';
import type { UserPartitionedLocalStoreFactory } from '../../data/local/repositories/userPartitionedLocalStoreFactory';
import type { UserOwnedDraftRecord } from '../../data/local/repositories/userPartitionedLocalTypes';
import type { AssignedWorkPackageApiClient } from './workPackageApiClient';
import type {
  AssignedWorkPackageSnapshot,
  AssignedWorkPackageStatus,
  LocalAssignedWorkPackageSummary,
} from './model';
import type {
  SharedExecutionReportLifecycleState,
  SharedExecutionSyncState,
} from '../execution/model';
import { LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE } from '../sync/queueContracts';

interface AssignedWorkPackageCatalogServiceDependencies {
  apiClient: AssignedWorkPackageApiClient;
  userPartitions: UserPartitionedLocalStoreFactory;
  now?: () => Date;
}

export class AssignedWorkPackageCatalogService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: AssignedWorkPackageCatalogServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async loadLocalCatalog(session: ActiveUserSession): Promise<LocalAssignedWorkPackageSummary[]> {
    const store = this.dependencies.userPartitions.forUser(session.userId);
    return this.withLocalRollupStatus(store, await store.workPackages.listSummaries());
  }

  async refreshConnectedCatalog(
    session: ActiveUserSession,
  ): Promise<LocalAssignedWorkPackageSummary[]> {
    assertConnectedSession(session);
    const remoteSummaries = await this.dependencies.apiClient.listAssignedPackages();
    const workPackages = this.dependencies.userPartitions.forUser(session.userId).workPackages;
    await workPackages.replaceCatalog(remoteSummaries, this.now().toISOString());
    return workPackages.listSummaries();
  }

  async downloadAssignedPackage(
    session: ActiveUserSession,
    workPackageId: string,
  ): Promise<{
    snapshot: AssignedWorkPackageSnapshot;
    summaries: LocalAssignedWorkPackageSummary[];
  }> {
    assertConnectedSession(session);
    const workPackages = this.dependencies.userPartitions.forUser(session.userId).workPackages;
    const snapshot = await this.dependencies.apiClient.downloadAssignedPackage(workPackageId);
    await workPackages.saveDownloadedSnapshot(snapshot, this.now().toISOString());
    const summaries = await workPackages.listSummaries();
    const mirroredSummary = summaries.find((summary) => summary.id === snapshot.summary.id);

    return {
      snapshot: mirroredSummary
        ? { ...snapshot, summary: { ...snapshot.summary, status: mirroredSummary.status } }
        : snapshot,
      summaries,
    };
  }

  private async withLocalRollupStatus(
    store: ReturnType<UserPartitionedLocalStoreFactory['forUser']>,
    summaries: LocalAssignedWorkPackageSummary[],
  ): Promise<LocalAssignedWorkPackageSummary[]> {
    const drafts = await store.drafts.listDrafts();
    const reports = drafts
      .map(parseStoredReportCatalogPayload)
      .filter((report): report is StoredReportCatalogPayload => report !== null);

    return Promise.all(
      summaries.map(async (summary) => {
        const snapshot = await store.workPackages.getSnapshot(summary.id);
        const expectedTagCount = snapshot?.tags.length ?? summary.tagCount;
        const packageReports = reports.filter((report) => report.workPackageId === summary.id);
        if (hasFreshMirroredServerRollup(summary, packageReports)) {
          return summary;
        }

        const status = deriveRollupStatus(
          summary.status,
          expectedTagCount,
          packageReports,
        );

        return status === summary.status ? summary : { ...summary, status };
      }),
    );
  }
}

function assertConnectedSession(session: ActiveUserSession) {
  if (session.connectionMode !== 'connected') {
    throw new Error('Reconnect before refreshing or downloading assigned work packages.');
  }
}

interface StoredReportCatalogPayload {
  reportId: string;
  workPackageId: string;
  tagId: string;
  lifecycleState: SharedExecutionReportLifecycleState;
  syncState: SharedExecutionSyncState;
  updatedAt: string;
}

function parseStoredReportCatalogPayload(
  draft: UserOwnedDraftRecord,
): StoredReportCatalogPayload | null {
  if (draft.businessObjectType !== LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE) {
    return null;
  }

  try {
    const parsed = JSON.parse(draft.payloadJson) as Partial<StoredReportCatalogPayload>;
    if (
      typeof parsed.reportId !== 'string' ||
      typeof parsed.workPackageId !== 'string' ||
      typeof parsed.tagId !== 'string' ||
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
      lifecycleState: parsed.lifecycleState,
      syncState: parsed.syncState,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

function hasFreshMirroredServerRollup(
  summary: LocalAssignedWorkPackageSummary,
  reports: StoredReportCatalogPayload[],
): boolean {
  if (
    summary.status !== 'completed' &&
    summary.status !== 'attention_needed'
  ) {
    return false;
  }

  const latestReportUpdatedAt = reports.reduce<string | null>(
    (latest, report) =>
      !latest || isAtOrAfterTimestamp(report.updatedAt, latest) ? report.updatedAt : latest,
    null,
  );

  // Server roll-up is derived from child reports without advancing package updatedAt.
  // The local mirror timestamp is the freshest known point for that server-authoritative roll-up.
  return latestReportUpdatedAt
    ? isAtOrAfterTimestamp(summary.localUpdatedAt, latestReportUpdatedAt)
    : true;
}

function deriveRollupStatus(
  currentStatus: AssignedWorkPackageStatus,
  expectedTagCount: number,
  reports: StoredReportCatalogPayload[],
): AssignedWorkPackageStatus {
  if (reports.length === 0) {
    return currentStatus;
  }

  if (
    reports.some(
      (report) =>
        report.lifecycleState === 'Returned by Supervisor' ||
        report.lifecycleState === 'Returned by Manager' ||
        report.syncState === 'sync-issue',
    )
  ) {
    return 'attention_needed';
  }

  const approvedTags = new Set(
    reports
      .filter((report) => report.lifecycleState === 'Approved')
      .map((report) => report.tagId),
  );
  if (expectedTagCount > 0 && approvedTags.size >= expectedTagCount) {
    return 'completed';
  }

  const submittedTags = new Set(reports.map((report) => report.tagId));
  const hasReviewableReport = reports.some(
    (report) =>
      report.lifecycleState === 'Submitted - Pending Supervisor Review' ||
      report.lifecycleState === 'Escalated - Pending Manager Review',
  );
  if (expectedTagCount > 0 && submittedTags.size >= expectedTagCount && hasReviewableReport) {
    return 'pending_review';
  }

  return 'in_progress';
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

function isSharedExecutionSyncState(value: unknown): value is SharedExecutionSyncState {
  return (
    value === 'local-only' ||
    value === 'queued' ||
    value === 'syncing' ||
    value === 'pending-validation' ||
    value === 'synced' ||
    value === 'sync-issue'
  );
}

function isAtOrAfterTimestamp(candidate: string, reference: string): boolean {
  const candidateTime = Date.parse(candidate);
  const referenceTime = Date.parse(reference);

  if (Number.isFinite(candidateTime) && Number.isFinite(referenceTime)) {
    return candidateTime >= referenceTime;
  }

  return candidate >= reference;
}
