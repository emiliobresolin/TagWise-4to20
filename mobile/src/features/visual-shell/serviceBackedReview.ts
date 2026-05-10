import { canPerformReviewActions, type ActiveUserSession } from '../auth/model';
import type {
  SupervisorReviewApprovalHistoryItem,
  SupervisorReviewEvidenceReference,
  SupervisorReviewPhotoAttachment,
  SupervisorReviewQueueItem,
  SupervisorReviewReportDetail,
  SupervisorReviewRiskFlag,
} from '../review/model';
import {
  buildVisualAiDiagnosisProjection,
  type VisualAiDiagnosisProjection,
  type VisualAiDiagnosisProjectionInput,
  type VisualReportSummaryRow,
} from './serviceBackedReport';

export type VisualReviewRole = 'supervisor' | 'manager';

export type VisualReviewAccessState =
  | 'signed-out-demo'
  | 'hidden'
  | 'connected-required'
  | 'available';

export interface VisualReviewAccessProjection {
  state: VisualReviewAccessState;
  reviewerRole: VisualReviewRole | null;
  entryVisible: boolean;
  canLoadQueue: boolean;
  canUseDecisionActions: boolean;
  label: string;
  detail: string;
}

export type VisualReviewQueueGroupKey =
  | 'pending-review'
  | 'escalated'
  | 'returned'
  | 'approved'
  | 'other';

export interface VisualReviewQueueItemProjection extends SupervisorReviewQueueItem {
  statusLabel: string;
  submittedAtLabel: string;
  acceptedAtLabel: string;
}

export interface VisualReviewQueueGroup {
  key: VisualReviewQueueGroupKey;
  label: string;
  emptyLabel: string;
  items: VisualReviewQueueItemProjection[];
}

export interface VisualReviewEvidenceReferenceProjection
  extends SupervisorReviewEvidenceReference {
  stateLabel: string;
}

export interface VisualReviewRiskFlagProjection
  extends SupervisorReviewRiskFlag {
  stateLabel: string;
  justificationLabel: string;
}

export interface VisualReviewPhotoAttachmentProjection extends SupervisorReviewPhotoAttachment {
  finalizedLabel: string;
}

export interface VisualReviewApprovalHistoryProjection
  extends SupervisorReviewApprovalHistoryItem {
  occurredAtLabel: string;
  stateTransitionLabel: string;
}

export interface VisualReviewDetailProjection {
  state: 'available' | 'unavailable';
  reportId: string | null;
  reviewerRole: VisualReviewRole | null;
  title: string;
  lifecycleStateLabel: string;
  syncStateLabel: string;
  summaryRows: VisualReportSummaryRow[];
  evidenceReferences: VisualReviewEvidenceReferenceProjection[];
  riskFlags: VisualReviewRiskFlagProjection[];
  photoAttachments: VisualReviewPhotoAttachmentProjection[];
  evidenceStatusRows: VisualReportSummaryRow[];
  approvalHistory: {
    items: VisualReviewApprovalHistoryProjection[];
    placeholder: string;
  };
  aiDiagnosis: VisualAiDiagnosisProjection;
  canApprove: boolean;
  canReturn: boolean;
  canEscalate: boolean;
  unavailableReason: string | null;
}

export type VisualReviewDecisionKind = 'approve' | 'return' | 'escalate';

export type VisualReviewDecisionRequest =
  | {
      state: 'blocked';
      kind: VisualReviewDecisionKind;
      message: string;
    }
  | {
      state: 'requires-confirmation';
      kind: VisualReviewDecisionKind;
      reportId: string;
      title: string;
      message: string;
      confirmLabel: string;
      comment: string | null;
    };

export interface VisualReviewDecisionCallbacks {
  onApproveReport: (reportId: string) => Promise<void> | void;
  onReturnReport: (reportId: string) => Promise<void> | void;
  onEscalateReport: (reportId: string) => Promise<void> | void;
}

export function buildVisualReviewAccess(
  session: ActiveUserSession | null,
): VisualReviewAccessProjection {
  if (!session) {
    return {
      state: 'signed-out-demo',
      reviewerRole: null,
      entryVisible: false,
      canLoadQueue: false,
      canUseDecisionActions: false,
      label: 'Demo-only approval',
      detail: 'Signed-out approval screens are illustrative and never dispatch official decisions.',
    };
  }

  if (session.role !== 'supervisor' && session.role !== 'manager') {
    return {
      state: 'hidden',
      reviewerRole: null,
      entryVisible: false,
      canLoadQueue: false,
      canUseDecisionActions: false,
      label: 'Technician workflow',
      detail: 'Technician sessions cannot access supervisor review queues or actions.',
    };
  }

  const reviewerRole: VisualReviewRole = session.role;
  const canReview = canPerformReviewActions(session.role, session.connectionMode);

  if (!canReview) {
    return {
      state: 'connected-required',
      reviewerRole,
      entryVisible: false,
      canLoadQueue: false,
      canUseDecisionActions: false,
      label: 'Connected review required',
      detail:
        'Official review queues and decisions require a connected reviewer session. Cached role metadata is not authoritative for approval.',
    };
  }

  return {
    state: 'available',
    reviewerRole,
    entryVisible: true,
    canLoadQueue: true,
    canUseDecisionActions: true,
    label: reviewerRole === 'manager' ? 'Manager review' : 'Supervisor review',
    detail:
      reviewerRole === 'manager'
        ? 'Escalated reports load from the connected manager review service.'
        : 'Server-accepted reports load from the connected supervisor review service.',
  };
}

export function buildVisualReviewQueueGroups(
  items: readonly SupervisorReviewQueueItem[],
): VisualReviewQueueGroup[] {
  const groups = buildEmptyGroups();

  for (const item of items) {
    const key = toQueueGroupKey(item.reportState);
    const group = groups.find((candidate) => candidate.key === key) ?? groups[groups.length - 1];
    group.items.push({
      ...item,
      statusLabel: item.lifecycleState,
      submittedAtLabel: formatTimestamp(item.submittedAt),
      acceptedAtLabel: formatTimestamp(item.acceptedAt),
    });
  }

  return groups;
}

export function buildVisualReviewDetailProjection(
  report: SupervisorReviewReportDetail | null,
  access: VisualReviewAccessProjection,
  aiDiagnosis?: VisualAiDiagnosisProjectionInput | null,
): VisualReviewDetailProjection {
  if (!report) {
    return {
      state: 'unavailable',
      reportId: null,
      reviewerRole: access.reviewerRole,
      title: 'No report selected',
      lifecycleStateLabel: 'Unavailable',
      syncStateLabel: 'Unavailable',
      summaryRows: [],
      evidenceReferences: [],
      riskFlags: [],
      photoAttachments: [],
      evidenceStatusRows: [],
      approvalHistory: {
        items: [],
        placeholder: 'Open a service-backed review report to see approval history.',
      },
      aiDiagnosis: buildVisualAiDiagnosisProjection(aiDiagnosis),
      canApprove: false,
      canReturn: false,
      canEscalate: false,
      unavailableReason: 'Select a report from the connected review queue.',
    };
  }

  const canAct = access.canUseDecisionActions;
  const isSupervisor = access.reviewerRole === 'supervisor';

  return {
    state: 'available',
    reportId: report.reportId,
    reviewerRole: access.reviewerRole,
    title: `${report.tagId} review detail`,
    lifecycleStateLabel: report.lifecycleState,
    syncStateLabel: report.syncState,
    summaryRows: [
      { label: 'Report', value: report.reportId },
      { label: 'Work package', value: report.workPackageId },
      { label: 'Tag', value: report.tagId },
      { label: 'Template', value: `${report.templateId} (${report.templateVersion})` },
      { label: 'Technician', value: report.technicianUserId },
      { label: 'Submitted', value: formatTimestamp(report.submittedAt) },
      { label: 'Accepted', value: formatTimestamp(report.acceptedAt) },
      { label: 'Execution', value: report.executionSummary },
      { label: 'History', value: report.historySummary },
      { label: 'Deterministic guidance', value: report.draftDiagnosisSummary },
    ],
    evidenceReferences: report.evidenceReferences.map((reference) => ({
      ...reference,
      stateLabel: reference.satisfied ? 'Satisfied' : 'Missing',
    })),
    riskFlags: report.riskFlags.map((riskFlag) => ({
      ...riskFlag,
      stateLabel:
        riskFlag.justificationRequired && riskFlag.justificationText.trim().length === 0
          ? 'Justification required'
          : 'Visible risk',
      justificationLabel: riskFlag.justificationText.trim() || 'Not captured',
    })),
    photoAttachments: report.photoAttachments.map((attachment) => ({
      ...attachment,
      finalizedLabel: attachment.presenceFinalizedAt
        ? formatTimestamp(attachment.presenceFinalizedAt)
        : 'Not finalized',
    })),
    evidenceStatusRows: [
      { label: 'Evidence state', value: report.evidenceStatus.state },
      { label: 'Photo evidence', value: report.evidenceStatus.message },
      { label: 'Total photos', value: `${report.evidenceStatus.totalPhotoAttachments}` },
      { label: 'Finalized photos', value: `${report.evidenceStatus.finalizedPhotoAttachments}` },
      { label: 'Pending photos', value: `${report.evidenceStatus.pendingPhotoAttachments}` },
    ],
    approvalHistory: {
      items: report.approvalHistory.items.map((item) => ({
        ...item,
        occurredAtLabel: formatTimestamp(item.occurredAt),
        stateTransitionLabel: `${item.priorState ?? 'Unknown'} -> ${
          item.nextState ?? 'Unknown'
        }`,
      })),
      placeholder: report.approvalHistory.placeholder,
    },
    aiDiagnosis: buildVisualAiDiagnosisProjection(aiDiagnosis),
    canApprove: canAct,
    canReturn: canAct,
    canEscalate: canAct && isSupervisor,
    unavailableReason: null,
  };
}

export function buildVisualReviewDecisionRequest(input: {
  kind: VisualReviewDecisionKind;
  detail: VisualReviewDetailProjection;
  returnComment: string;
  escalationRationale: string;
}): VisualReviewDecisionRequest {
  if (input.detail.state !== 'available' || !input.detail.reportId) {
    return {
      state: 'blocked',
      kind: input.kind,
      message: 'Open a service-backed review report before deciding.',
    };
  }

  if (input.kind === 'approve') {
    if (!input.detail.canApprove) {
      return {
        state: 'blocked',
        kind: input.kind,
        message: 'Connected reviewer access is required before approving a report.',
      };
    }

    return {
      state: 'requires-confirmation',
      kind: input.kind,
      reportId: input.detail.reportId,
      title: 'Confirm approval',
      message: 'Approve this report through the connected review service?',
      confirmLabel: 'Confirm approve',
      comment: null,
    };
  }

  if (input.kind === 'return') {
    const comment = input.returnComment.trim();
    if (!input.detail.canReturn) {
      return {
        state: 'blocked',
        kind: input.kind,
        message: 'Connected reviewer access is required before returning a report.',
      };
    }

    if (comment.length === 0) {
      return {
        state: 'blocked',
        kind: input.kind,
        message: 'Return comment is required before returning a report.',
      };
    }

    return {
      state: 'requires-confirmation',
      kind: input.kind,
      reportId: input.detail.reportId,
      title: 'Confirm return',
      message: 'Return this report with the captured reviewer comment?',
      confirmLabel: 'Confirm return',
      comment,
    };
  }

  const rationale = input.escalationRationale.trim();
  if (!input.detail.canEscalate) {
    return {
      state: 'blocked',
      kind: input.kind,
      message: 'Connected supervisor access is required before escalating a report.',
    };
  }

  if (rationale.length === 0) {
    return {
      state: 'blocked',
      kind: input.kind,
      message: 'Escalation rationale is required before escalating a report.',
    };
  }

  return {
    state: 'requires-confirmation',
    kind: input.kind,
    reportId: input.detail.reportId,
    title: 'Confirm escalation',
    message: 'Escalate this report for connected manager review?',
    confirmLabel: 'Confirm escalate',
    comment: rationale,
  };
}

export function createVisualReviewDecisionActions(callbacks: VisualReviewDecisionCallbacks) {
  return {
    confirmDecision: async (request: VisualReviewDecisionRequest) => {
      if (request.state !== 'requires-confirmation') {
        throw new Error(request.message);
      }

      if (request.kind === 'approve') {
        await callbacks.onApproveReport(request.reportId);
        return;
      }

      if (request.kind === 'return') {
        await callbacks.onReturnReport(request.reportId);
        return;
      }

      await callbacks.onEscalateReport(request.reportId);
    },
  };
}

function buildEmptyGroups(): VisualReviewQueueGroup[] {
  return [
    {
      key: 'pending-review',
      label: 'Pending Review',
      emptyLabel: 'No server-accepted reports are waiting in this queue.',
      items: [],
    },
    {
      key: 'escalated',
      label: 'Escalated',
      emptyLabel: 'No escalated reports are routed here.',
      items: [],
    },
    {
      key: 'returned',
      label: 'Returned',
      emptyLabel: 'No returned reports are present in this service-backed list.',
      items: [],
    },
    {
      key: 'approved',
      label: 'Approved',
      emptyLabel: 'No approved reports are present in this service-backed list.',
      items: [],
    },
    {
      key: 'other',
      label: 'Other',
      emptyLabel: 'No reports are present in this status group.',
      items: [],
    },
  ];
}

function toQueueGroupKey(
  state: SupervisorReviewQueueItem['reportState'],
): VisualReviewQueueGroupKey {
  switch (state) {
    case 'submitted-pending-review':
      return 'pending-review';
    case 'escalated-pending-manager-review':
      return 'escalated';
    case 'returned-by-supervisor':
    case 'returned-by-manager':
      return 'returned';
    case 'approved':
      return 'approved';
    default:
      return 'other';
  }
}

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not recorded';
}
