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
  type SupervisorReviewDecisionResponse,
  type SupervisorReviewDecisionType,
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
    private readonly managerReviewerUserId: string | null = null,
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

    const record = await this.repository.getSupervisorRoutedReportById(user.id, reportId);
    if (!record) {
      throw new SupervisorReviewError('Reviewable report was not found in supervisor scope.', 404);
    }
    const approvalHistoryItems = await this.repository.listReportApprovalHistory(record.reportId);

    return {
      contractVersion: SUPERVISOR_REVIEW_API_CONTRACT_VERSION,
      report: toReportDetail(record, approvalHistoryItems),
    };
  }

  async approveStandardReport(
    user: AuthenticatedUser,
    reportId: string,
    context: { correlationId: string },
  ): Promise<SupervisorReviewDecisionResponse> {
    return this.recordDecision(user, reportId, {
      decisionType: 'approved',
      reportState: 'approved',
      lifecycleState: 'Approved',
      actionType: 'report.supervisor.approved',
      comment: null,
      correlationId: context.correlationId,
    });
  }

  async returnStandardReport(
    user: AuthenticatedUser,
    reportId: string,
    comment: string,
    context: { correlationId: string },
  ): Promise<SupervisorReviewDecisionResponse> {
    const trimmedComment = comment.trim();
    if (trimmedComment.length === 0) {
      throw new SupervisorReviewError('Return comment is required before returning a report.', 400);
    }

    return this.recordDecision(user, reportId, {
      decisionType: 'returned',
      reportState: 'returned-by-supervisor',
      lifecycleState: 'Returned by Supervisor',
      actionType: 'report.supervisor.returned',
      comment: trimmedComment,
      correlationId: context.correlationId,
    });
  }

  async escalateHigherRiskReport(
    user: AuthenticatedUser,
    reportId: string,
    rationale: string,
    context: { correlationId: string },
  ): Promise<SupervisorReviewDecisionResponse> {
    const trimmedRationale = rationale.trim();
    if (trimmedRationale.length === 0) {
      throw new SupervisorReviewError('Escalation rationale is required before escalating a report.', 400);
    }

    assertSupervisorCanReview(user);

    if (!this.managerReviewerUserId) {
      throw new SupervisorReviewError('Manager reviewer route is not configured.', 500);
    }

    const current = await this.repository.getSupervisorRoutedReportById(user.id, reportId);
    if (!current) {
      throw new SupervisorReviewError('Reviewable report was not found in supervisor scope.', 404);
    }

    if (current.lifecycleState !== 'Submitted - Pending Supervisor Review') {
      throw new SupervisorReviewError('Report is no longer pending supervisor review.', 409);
    }

    const decidedAt = this.now().toISOString();
    const persisted = await this.repository.recordSupervisorEscalation({
      supervisorUserId: user.id,
      actorRole: user.role,
      ownerUserId: current.ownerUserId,
      reportId,
      managerReviewerUserId: this.managerReviewerUserId,
      reportState: 'escalated-pending-manager-review',
      lifecycleState: 'Escalated - Pending Manager Review',
      decidedAt,
      correlationId: context.correlationId,
      actionType: 'report.supervisor.escalated',
      priorState: current.lifecycleState,
      rationale: trimmedRationale,
      metadata: {
        decisionType: 'escalated',
        escalationFlag: true,
        reviewLevel: 'supervisor',
        workPackageId: current.workPackageId,
        tagId: current.tagId,
        technicianUserId: current.ownerUserId,
        managerReviewerUserId: this.managerReviewerUserId,
        serverReportVersion: current.serverReportVersion,
        productSignals: getEscalationProductSignals(current),
      },
    });

    if (!persisted) {
      throw new SupervisorReviewError('Report is no longer pending supervisor review.', 409);
    }

    return {
      contractVersion: SUPERVISOR_REVIEW_API_CONTRACT_VERSION,
      reportId: persisted.report.reportId,
      decisionType: 'escalated',
      reportState: 'escalated-pending-manager-review',
      lifecycleState: 'Escalated - Pending Manager Review',
      syncState: persisted.report.syncState,
      decidedAt,
      auditEventId: persisted.auditEvent.id,
      comment: trimmedRationale,
      managerReviewerUserId: persisted.managerReviewerUserId,
    };
  }

  private async recordDecision(
    user: AuthenticatedUser,
    reportId: string,
    decision: {
      decisionType: SupervisorReviewDecisionType;
      reportState: SupervisorReviewDecisionResponse['reportState'];
      lifecycleState: SupervisorReviewDecisionResponse['lifecycleState'];
      actionType: string;
      comment: string | null;
      correlationId: string;
    },
  ): Promise<SupervisorReviewDecisionResponse> {
    assertSupervisorCanReview(user);

    const current = await this.repository.getSupervisorRoutedReportById(user.id, reportId);
    if (!current) {
      throw new SupervisorReviewError('Reviewable report was not found in supervisor scope.', 404);
    }

    if (current.lifecycleState !== 'Submitted - Pending Supervisor Review') {
      throw new SupervisorReviewError('Report is no longer pending supervisor review.', 409);
    }

    const decidedAt = this.now().toISOString();
    const persisted = await this.repository.recordSupervisorDecision({
      supervisorUserId: user.id,
      actorRole: user.role,
      ownerUserId: current.ownerUserId,
      reportId,
      reportState: decision.reportState,
      lifecycleState: decision.lifecycleState,
      decidedAt,
      correlationId: decision.correlationId,
      actionType: decision.actionType,
      priorState: current.lifecycleState,
      comment: decision.comment,
      metadata: {
        decisionType: decision.decisionType,
        reviewLevel: 'supervisor',
        standardCase: true,
        workPackageId: current.workPackageId,
        tagId: current.tagId,
        technicianUserId: current.ownerUserId,
        serverReportVersion: current.serverReportVersion,
      },
    });

    if (!persisted) {
      throw new SupervisorReviewError('Report is no longer pending supervisor review.', 409);
    }

    return {
      contractVersion: SUPERVISOR_REVIEW_API_CONTRACT_VERSION,
      reportId: persisted.report.reportId,
      decisionType: decision.decisionType,
      reportState: decision.reportState,
      lifecycleState: decision.lifecycleState,
      syncState: persisted.report.syncState,
      decidedAt,
      auditEventId: persisted.auditEvent.id,
      comment: decision.comment,
    };
  }
}

function toReportDetail(
  record: ReviewableReportRecord,
  approvalHistoryItems: SupervisorReviewReportDetail['approvalHistory']['items'],
): SupervisorReviewReportDetail {
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
      items: approvalHistoryItems,
      placeholder:
        approvalHistoryItems.length === 0
          ? 'No approval decisions have been recorded for this report yet.'
          : '',
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

function getEscalationProductSignals(record: ReviewableReportRecord) {
  const payload = parseStoredReportPayload(record.payloadJson);
  const riskFlags = getRiskFlags(payload);
  const evidenceStatus = summarizeEvidenceStatus(getPhotoAttachments(payload));

  return {
    riskFlagCount: riskFlags.length,
    riskReasonTypes: riskFlags.map((riskFlag) => riskFlag.reasonType),
    pendingEvidenceCount: evidenceStatus.pendingPhotoAttachments,
    evidenceStatus: evidenceStatus.state,
  };
}
