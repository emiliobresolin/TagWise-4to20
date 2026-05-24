export const SUPERVISOR_REVIEW_API_CONTRACT_VERSION = '2026-04-v1' as const;

export interface SupervisorReviewEvidenceReference {
  label: string;
  requirementLevel: 'minimum' | 'expected';
  evidenceKind: 'structured-readings' | 'observation-notes' | 'photo-evidence' | 'unmapped';
  satisfied: boolean;
  detail: string;
}

export interface SupervisorReviewRiskFlag {
  id: string;
  reasonType: string;
  justificationRequired: boolean;
  justificationText: string;
}

export type SupervisorReviewPhotoExecutionStepId =
  | 'context'
  | 'instrument'
  | 'calculation'
  | 'history'
  | 'guidance'
  | 'report';

export interface SupervisorReviewPhotoAttachment {
  evidenceId: string;
  serverEvidenceId: string | null;
  presenceFinalizedAt: string | null;
  syncState: 'local-only' | 'queued' | 'syncing' | 'pending-validation' | 'synced' | 'sync-issue';
  /**
   * Story 8.8 D-02: per-photo sub-step label set by the technician's mobile
   * client at attach time. Pre-8.8 reports do not carry this field; the
   * supervisor renderer must treat null/undefined as "no sub-step label".
   */
  contextNote?: string | null;
  executionStepId?: SupervisorReviewPhotoExecutionStepId | null;
  /**
   * Story 8.8 D-04: per-photo technician free-text observation. Pre-8.8
   * reports do not carry this field.
   */
  technicianNote?: string | null;
  /**
   * Story 10.2 (issue #4): pre-signed download URL for the finalized photo
   * binary so the supervisor / manager review detail screen can render the
   * image inline. Null when the photo has not been finalized yet or when
   * the access authorization could not be obtained (offline / forbidden).
   */
  downloadUrl?: string | null;
}

export interface SupervisorReviewEvidenceStatus {
  state: 'no-photo-evidence' | 'all-photo-evidence-finalized' | 'pending-photo-evidence';
  totalPhotoAttachments: number;
  finalizedPhotoAttachments: number;
  pendingPhotoAttachments: number;
  message: string;
}

export interface SupervisorReviewApprovalHistoryItem {
  auditEventId: string;
  actorRole: string;
  actionType: string;
  occurredAt: string;
  correlationId: string;
  priorState: string | null;
  nextState: string | null;
  comment: string | null;
}

export interface SupervisorReviewQueueItem {
  reportId: string;
  serverReportVersion: string;
  technicianUserId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  reportState:
    | 'submitted-pending-review'
    | 'escalated-pending-manager-review'
    | 'returned-by-supervisor'
    | 'returned-by-manager'
    | 'approved';
  lifecycleState:
    | 'Submitted - Pending Supervisor Review'
    | 'Escalated - Pending Manager Review'
    | 'Returned by Supervisor'
    | 'Returned by Manager'
    | 'Approved';
  syncState: 'synced';
  submittedAt: string;
  acceptedAt: string;
  executionSummary: string;
  riskFlagCount: number;
  pendingEvidenceCount: number;
}

export interface SupervisorReviewReportDetail extends SupervisorReviewQueueItem {
  historySummary: string;
  draftDiagnosisSummary: string;
  evidenceReferences: SupervisorReviewEvidenceReference[];
  riskFlags: SupervisorReviewRiskFlag[];
  photoAttachments: SupervisorReviewPhotoAttachment[];
  evidenceStatus: SupervisorReviewEvidenceStatus;
  approvalHistory: {
    items: SupervisorReviewApprovalHistoryItem[];
    placeholder: string;
  };
  /**
   * Story 8.9 D-01: assistive AI diagnosis surface on supervisor review.
   * Always present (defaults to state='unavailable' when no AI row exists on
   * the backend). Never blocks supervisor decision — assistive only.
   */
  aiDiagnosis: SupervisorReviewAiDiagnosisProjection;
}

export type SupervisorReviewAiDiagnosisState =
  | 'pending'
  | 'available'
  | 'unavailable'
  | 'failed-nonblocking';

export interface SupervisorReviewAiDiagnosisProjection {
  state: SupervisorReviewAiDiagnosisState;
  summary: string | null;
  detail: string | null;
  providerLabel: string | null;
  generatedAt: string | null;
  failureReason: string | null;
  lastRequestedAt: string | null;
}

export interface SupervisorReviewQueueResponse {
  contractVersion: typeof SUPERVISOR_REVIEW_API_CONTRACT_VERSION;
  items: SupervisorReviewQueueItem[];
}

export interface SupervisorReviewReportResponse {
  contractVersion: typeof SUPERVISOR_REVIEW_API_CONTRACT_VERSION;
  report: SupervisorReviewReportDetail;
}

export type SupervisorReviewDecisionType = 'approved' | 'returned' | 'escalated';

export interface SupervisorReviewDecisionResponse {
  contractVersion: typeof SUPERVISOR_REVIEW_API_CONTRACT_VERSION;
  reportId: string;
  decisionType: SupervisorReviewDecisionType;
  reportState: 'approved' | 'returned-by-supervisor' | 'escalated-pending-manager-review';
  lifecycleState: 'Approved' | 'Returned by Supervisor' | 'Escalated - Pending Manager Review';
  syncState: 'synced';
  decidedAt: string;
  auditEventId: string;
  comment: string | null;
  managerReviewerUserId?: string;
}

export type ManagerReviewDecisionType = 'approved' | 'returned';

export interface ManagerReviewDecisionResponse {
  contractVersion: typeof SUPERVISOR_REVIEW_API_CONTRACT_VERSION;
  reportId: string;
  decisionType: ManagerReviewDecisionType;
  reportState: 'approved' | 'returned-by-manager';
  lifecycleState: 'Approved' | 'Returned by Manager';
  syncState: 'synced';
  decidedAt: string;
  auditEventId: string;
  comment: string | null;
}
