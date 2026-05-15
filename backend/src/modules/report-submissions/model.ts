import type { AuthenticatedUser } from '../auth/model';

export const REPORT_SUBMISSION_API_CONTRACT_VERSION = '2026-04-v1' as const;

export type ReportSubmissionState =
  | 'submitted-pending-review'
  | 'escalated-pending-manager-review'
  | 'returned-by-supervisor'
  | 'returned-by-manager'
  | 'approved';
export type ReportSubmissionLifecycleState =
  | 'Submitted - Pending Supervisor Review'
  | 'Escalated - Pending Manager Review'
  | 'Returned by Supervisor'
  | 'Returned by Manager'
  | 'Approved';
export type ReportSubmissionSyncState = 'synced';

export type ReportSubmissionIssueReasonCode =
  | 'malformed-report-payload'
  | 'out-of-scope'
  | 'invalid-lifecycle-transition'
  | 'minimum-evidence-missing'
  | 'required-justification-missing'
  | 'required-evidence-not-finalized'
  | 'conflicting-report-version';

export interface ReportSubmissionSyncIssue {
  reasonCode: ReportSubmissionIssueReasonCode;
  message: string;
  serverReportVersion?: string;
}

export interface ReportSubmissionEvidenceReference {
  label: string;
  requirementLevel: 'minimum' | 'expected';
  evidenceKind: 'structured-readings' | 'observation-notes' | 'photo-evidence' | 'unmapped';
  satisfied: boolean;
  detail: string;
}

export interface ReportSubmissionRiskFlag {
  id: string;
  reasonType: string;
  justificationRequired: boolean;
  justificationText: string;
}

/**
 * Stable identifier for the execution step that produced the photo. Mirrors
 * the mobile `SharedExecutionStepKind` so that supervisor review can render the
 * sub-step badge ("Instrumento", "Calculo", "Checklist", etc.) without a
 * separate translation table on the backend.
 */
export type ReportSubmissionPhotoExecutionStepId =
  | 'context'
  | 'instrument'
  | 'calculation'
  | 'history'
  | 'guidance'
  | 'report';

export interface ReportSubmissionPhotoAttachment {
  evidenceId: string;
  serverEvidenceId: string | null;
  presenceFinalizedAt: string | null;
  syncState: 'local-only' | 'queued' | 'syncing' | 'pending-validation' | 'synced' | 'sync-issue';
  /**
   * Story 8.8 D-02: free-form sub-step label set by the mobile client at attach
   * time (e.g., "Ponto de loop 50%", "Instrumento", "Checklist"). Optional and
   * backwards-compatible: pre-8.8 stored payloads do not have this field; the
   * supervisor projection falls back to `null`.
   */
  contextNote?: string | null;
  /**
   * Canonical execution step kind that produced the photo. Optional and
   * backwards-compatible with pre-8.8 payloads.
   */
  executionStepId?: ReportSubmissionPhotoExecutionStepId | null;
  /**
   * Story 8.8 D-04: free-text technician observation captured at or after
   * attach time (e.g., "Loop OK, cabos danificados na flange"). Optional and
   * backwards-compatible.
   */
  technicianNote?: string | null;
}

export interface ReportSubmissionRequest {
  contractVersion: typeof REPORT_SUBMISSION_API_CONTRACT_VERSION;
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  reportState: 'submitted-pending-sync';
  lifecycleState: 'Submitted - Pending Sync';
  syncState: 'queued' | 'syncing' | 'pending-validation';
  objectVersion: string;
  idempotencyKey: string;
  submittedAt: string;
  executionSummary: string;
  historySummary: string;
  draftDiagnosisSummary: string;
  evidenceReferences: ReportSubmissionEvidenceReference[];
  riskFlags: ReportSubmissionRiskFlag[];
  photoAttachments: ReportSubmissionPhotoAttachment[];
}

export interface ReportSubmissionRecord {
  ownerUserId: string;
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  localObjectVersion: string;
  idempotencyKey: string;
  serverReportVersion: string;
  reportState: ReportSubmissionState;
  lifecycleState: ReportSubmissionLifecycleState;
  syncState: ReportSubmissionSyncState;
  submittedAt: string;
  acceptedAt: string;
  payloadJson: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ReportSubmissionAcceptedResult {
  contractVersion: typeof REPORT_SUBMISSION_API_CONTRACT_VERSION;
  reportId: string;
  serverReportVersion: string;
  reportState: ReportSubmissionState;
  lifecycleState: ReportSubmissionLifecycleState;
  syncState: ReportSubmissionSyncState;
  acceptedAt: string;
}

export interface ReportSubmissionApprovalHistoryItem {
  auditEventId: string;
  actorRole: string;
  actionType: string;
  occurredAt: string;
  correlationId: string;
  priorState: string | null;
  nextState: string | null;
  comment: string | null;
}

/**
 * Story 8.9 D-01: per-report AI diagnosis surface returned on the technician
 * status fetch + the supervisor review detail. The fields mirror the mobile
 * `VisualAiDiagnosisProjectionInput` so the projection adapter can pass them
 * through with minimal translation. AI is assistive and non-blocking — none
 * of these states halt the report itself.
 */
export type ReportSubmissionAiDiagnosisState =
  | 'pending'
  | 'available'
  | 'unavailable'
  | 'failed-nonblocking';

export interface ReportSubmissionAiDiagnosisProjection {
  state: ReportSubmissionAiDiagnosisState;
  summary: string | null;
  detail: string | null;
  providerLabel: string | null;
  generatedAt: string | null;
  failureReason: string | null;
  lastRequestedAt: string | null;
}

export interface ReportSubmissionStatusResult extends ReportSubmissionAcceptedResult {
  approvalHistory: {
    items: ReportSubmissionApprovalHistoryItem[];
    placeholder: string;
  };
  aiDiagnosis: ReportSubmissionAiDiagnosisProjection;
}

export class ReportSubmissionError extends Error {
  readonly statusCode: number;
  readonly syncIssue: ReportSubmissionSyncIssue | null;

  constructor(
    message: string,
    statusCode: number = 400,
    syncIssue: ReportSubmissionSyncIssue | null = null,
  ) {
    super(message);
    this.name = 'ReportSubmissionError';
    this.statusCode = statusCode;
    this.syncIssue = syncIssue;
  }
}

export function assertTechnicianCanSubmitReport(user: AuthenticatedUser): void {
  if (user.role !== 'technician') {
    throw new ReportSubmissionError('Only technicians can submit field reports for validation.', 403);
  }
}
