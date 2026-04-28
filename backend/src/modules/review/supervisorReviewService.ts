import type { AuthenticatedUser } from '../auth/model';
import type {
  ReportSubmissionEvidenceReference,
  ReportSubmissionPhotoAttachment,
  ReportSubmissionRequest,
  ReportSubmissionRiskFlag,
} from '../report-submissions/model';
import {
  assertSupervisorCanReview,
  SupervisorReviewError,
  SUPERVISOR_REVIEW_API_CONTRACT_VERSION,
  type ReviewableReportRecord,
  type SupervisorReviewEvidenceStatus,
  type SupervisorReviewQueueResponse,
  type SupervisorReviewReportDetail,
  type SupervisorReviewReportResponse,
} from './model';
import type { SupervisorReviewRepository } from './supervisorReviewRepository';

export class SupervisorReviewService {
  constructor(
    private readonly repository: SupervisorReviewRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async ensureSeedRoutes(supervisorUserId: string, workPackageIds: string[]): Promise<void> {
    const routedAt = this.now().toISOString();

    for (const workPackageId of workPackageIds) {
      await this.repository.upsertSupervisorRoute({
        supervisorUserId,
        workPackageId,
        routedAt,
      });
    }
  }

  async listSupervisorQueue(user: AuthenticatedUser): Promise<SupervisorReviewQueueResponse> {
    assertSupervisorCanReview(user);

    const records = await this.repository.listSupervisorQueue(user.id);
    return {
      contractVersion: SUPERVISOR_REVIEW_API_CONTRACT_VERSION,
      items: records.map(toQueueItem),
    };
  }

  async getSupervisorReportDetail(
    user: AuthenticatedUser,
    reportId: string,
  ): Promise<SupervisorReviewReportResponse> {
    assertSupervisorCanReview(user);

    const record = await this.repository.getSupervisorReportDetail(user.id, reportId);
    if (!record) {
      throw new SupervisorReviewError('Reviewable report was not found in supervisor scope.', 404);
    }

    return {
      contractVersion: SUPERVISOR_REVIEW_API_CONTRACT_VERSION,
      report: toReportDetail(record),
    };
  }
}

function toReportDetail(record: ReviewableReportRecord): SupervisorReviewReportDetail {
  const payload = parseStoredReportPayload(record.payloadJson);
  const photoAttachments = getPhotoAttachments(payload);
  const evidenceStatus = summarizeEvidenceStatus(photoAttachments);

  return {
    ...toQueueItem(record),
    historySummary: getString(payload.historySummary),
    draftDiagnosisSummary: getString(payload.draftDiagnosisSummary),
    evidenceReferences: getEvidenceReferences(payload),
    riskFlags: getRiskFlags(payload),
    photoAttachments,
    evidenceStatus,
    approvalHistory: {
      items: [],
      placeholder: 'No approval decisions have been recorded for this report yet.',
    },
  };
}

function toQueueItem(record: ReviewableReportRecord) {
  const payload = parseStoredReportPayload(record.payloadJson);
  const riskFlags = getRiskFlags(payload);
  const evidenceStatus = summarizeEvidenceStatus(getPhotoAttachments(payload));

  return {
    reportId: record.reportId,
    serverReportVersion: record.serverReportVersion,
    technicianUserId: record.ownerUserId,
    workPackageId: record.workPackageId,
    tagId: record.tagId,
    templateId: record.templateId,
    templateVersion: record.templateVersion,
    reportState: record.reportState,
    lifecycleState: record.lifecycleState,
    syncState: record.syncState,
    submittedAt: record.submittedAt,
    acceptedAt: record.acceptedAt,
    executionSummary: getString(payload.executionSummary),
    riskFlagCount: riskFlags.length,
    pendingEvidenceCount: evidenceStatus.pendingPhotoAttachments,
  };
}

function summarizeEvidenceStatus(
  photoAttachments: ReportSubmissionPhotoAttachment[],
): SupervisorReviewEvidenceStatus {
  const finalizedPhotoAttachments = photoAttachments.filter(
    (attachment) => attachment.syncState === 'synced' && Boolean(attachment.presenceFinalizedAt),
  ).length;
  const pendingPhotoAttachments = photoAttachments.length - finalizedPhotoAttachments;

  if (photoAttachments.length === 0) {
    return {
      state: 'no-photo-evidence',
      totalPhotoAttachments: 0,
      finalizedPhotoAttachments: 0,
      pendingPhotoAttachments: 0,
      message: 'No photo evidence is attached to this accepted report.',
    };
  }

  if (pendingPhotoAttachments === 0) {
    return {
      state: 'all-photo-evidence-finalized',
      totalPhotoAttachments: photoAttachments.length,
      finalizedPhotoAttachments,
      pendingPhotoAttachments,
      message: 'All attached photo evidence has finalized server presence.',
    };
  }

  return {
    state: 'pending-photo-evidence',
    totalPhotoAttachments: photoAttachments.length,
    finalizedPhotoAttachments,
    pendingPhotoAttachments,
    message: `${pendingPhotoAttachments} attached photo evidence item(s) are still pending server presence.`,
  };
}

function parseStoredReportPayload(payload: unknown): Partial<ReportSubmissionRequest> {
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload) as unknown;
      return isRecord(parsed) ? (parsed as Partial<ReportSubmissionRequest>) : {};
    } catch {
      return {};
    }
  }

  return isRecord(payload) ? (payload as Partial<ReportSubmissionRequest>) : {};
}

function getEvidenceReferences(
  payload: Partial<ReportSubmissionRequest>,
): ReportSubmissionEvidenceReference[] {
  return Array.isArray(payload.evidenceReferences) ? payload.evidenceReferences : [];
}

function getRiskFlags(payload: Partial<ReportSubmissionRequest>): ReportSubmissionRiskFlag[] {
  return Array.isArray(payload.riskFlags) ? payload.riskFlags : [];
}

function getPhotoAttachments(
  payload: Partial<ReportSubmissionRequest>,
): ReportSubmissionPhotoAttachment[] {
  return Array.isArray(payload.photoAttachments) ? payload.photoAttachments : [];
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
