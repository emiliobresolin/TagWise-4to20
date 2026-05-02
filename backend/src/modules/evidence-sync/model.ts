import type { AuthenticatedUser } from '../auth/model';

export const EVIDENCE_SYNC_API_CONTRACT_VERSION = '2026-04-v1' as const;

export interface EvidenceMetadataSyncRequest {
  contractVersion: typeof EVIDENCE_SYNC_API_CONTRACT_VERSION;
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  evidenceId: string;
  fileName: string;
  mimeType: string | null;
  fileSizeBytes: number;
  executionStepId: 'context' | 'calculation' | 'history' | 'guidance' | 'report';
  source: 'camera' | 'library';
  localCapturedAt: string;
  metadataIdempotencyKey: string;
}

export interface EvidenceMetadataSyncRecord {
  serverEvidenceId: string;
  ownerUserId: string;
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  evidenceId: string;
  fileName: string;
  mimeType: string | null;
  fileSizeBytes: number;
  executionStepId: EvidenceMetadataSyncRequest['executionStepId'];
  source: EvidenceMetadataSyncRequest['source'];
  localCapturedAt: string;
  metadataIdempotencyKey: string;
  storageObjectKey: string | null;
  metadataReceivedAt: string;
  binaryUploadedAt: string | null;
  presenceFinalizedAt: string | null;
  presenceStatus: 'metadata-recorded' | 'binary-finalized';
  retentionPolicy: string;
  retentionExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceBinaryUploadAuthorization {
  serverEvidenceId: string;
  reportId: string;
  evidenceId: string;
  objectKey: string;
  uploadUrl: string;
  uploadMethod: 'PUT';
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

export interface EvidenceBinaryFinalizationResult {
  serverEvidenceId: string;
  reportId: string;
  evidenceId: string;
  presenceStatus: 'binary-finalized';
  presenceFinalizedAt: string;
}

export interface EvidenceBinaryAccessAuthorization {
  serverEvidenceId: string;
  reportId: string;
  evidenceId: string;
  downloadUrl: string;
  downloadMethod: 'GET';
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

export class EvidenceSyncError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'EvidenceSyncError';
    this.statusCode = statusCode;
  }
}

export function assertTechnician(user: AuthenticatedUser): void {
  if (user.role !== 'technician') {
    throw new EvidenceSyncError('Only technicians can synchronize field evidence.', 403);
  }
}
