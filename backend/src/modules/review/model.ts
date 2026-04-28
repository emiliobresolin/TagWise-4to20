import type { AuthenticatedUser } from '../auth/model';
import type {
  ReportSubmissionEvidenceReference,
  ReportSubmissionLifecycleState,
  ReportSubmissionPhotoAttachment,
  ReportSubmissionRiskFlag,
  ReportSubmissionState,
  ReportSubmissionSyncState,
} from '../report-submissions/model';

export const SUPERVISOR_REVIEW_API_CONTRACT_VERSION = '2026-04-v1' as const;

export type SupervisorReviewEvidencePresenceState =
  | 'no-photo-evidence'
  | 'all-photo-evidence-finalized'
  | 'pending-photo-evidence';

export interface SupervisorReviewEvidenceStatus {
  state: SupervisorReviewEvidencePresenceState;
  totalPhotoAttachments: number;
  finalizedPhotoAttachments: number;
  pendingPhotoAttachments: number;
  message: string;
}

export interface SupervisorReviewQueueItem {
  reportId: string;
  serverReportVersion: string;
  technicianUserId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  reportState: ReportSubmissionState;
  lifecycleState: ReportSubmissionLifecycleState;
  syncState: ReportSubmissionSyncState;
  submittedAt: string;
  acceptedAt: string;
  executionSummary: string;
  riskFlagCount: number;
  pendingEvidenceCount: number;
}

export interface SupervisorReviewQueueResponse {
  contractVersion: typeof SUPERVISOR_REVIEW_API_CONTRACT_VERSION;
  items: SupervisorReviewQueueItem[];
}

export interface SupervisorReviewReportDetail extends SupervisorReviewQueueItem {
  historySummary: string;
  draftDiagnosisSummary: string;
  evidenceReferences: ReportSubmissionEvidenceReference[];
  riskFlags: ReportSubmissionRiskFlag[];
  photoAttachments: ReportSubmissionPhotoAttachment[];
  evidenceStatus: SupervisorReviewEvidenceStatus;
  approvalHistory: {
    items: [];
    placeholder: string;
  };
}

export interface SupervisorReviewReportResponse {
  contractVersion: typeof SUPERVISOR_REVIEW_API_CONTRACT_VERSION;
  report: SupervisorReviewReportDetail;
}

export interface ReviewableReportRecord {
  ownerUserId: string;
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  serverReportVersion: string;
  reportState: ReportSubmissionState;
  lifecycleState: ReportSubmissionLifecycleState;
  syncState: ReportSubmissionSyncState;
  submittedAt: string;
  acceptedAt: string;
  payloadJson: unknown;
}

export class SupervisorReviewError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'SupervisorReviewError';
    this.statusCode = statusCode;
  }
}

export function assertSupervisorCanReview(user: AuthenticatedUser): void {
  if (user.role !== 'supervisor') {
    throw new SupervisorReviewError('Only supervisors can access the supervisor review queue.', 403);
  }
}
