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

export interface SupervisorReviewPhotoAttachment {
  evidenceId: string;
  serverEvidenceId: string | null;
  presenceFinalizedAt: string | null;
  syncState: 'local-only' | 'queued' | 'syncing' | 'pending-validation' | 'synced' | 'sync-issue';
}

export interface SupervisorReviewEvidenceStatus {
  state: 'no-photo-evidence' | 'all-photo-evidence-finalized' | 'pending-photo-evidence';
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
  reportState: 'submitted-pending-review';
  lifecycleState: 'Submitted - Pending Supervisor Review';
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
    items: [];
    placeholder: string;
  };
}

export interface SupervisorReviewQueueResponse {
  contractVersion: typeof SUPERVISOR_REVIEW_API_CONTRACT_VERSION;
  items: SupervisorReviewQueueItem[];
}

export interface SupervisorReviewReportResponse {
  contractVersion: typeof SUPERVISOR_REVIEW_API_CONTRACT_VERSION;
  report: SupervisorReviewReportDetail;
}
