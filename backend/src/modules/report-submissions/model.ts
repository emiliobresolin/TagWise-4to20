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

export interface ReportSubmissionPhotoAttachment {
  evidenceId: string;
  serverEvidenceId: string | null;
  presenceFinalizedAt: string | null;
  syncState: 'local-only' | 'queued' | 'syncing' | 'pending-validation' | 'synced' | 'sync-issue';
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
