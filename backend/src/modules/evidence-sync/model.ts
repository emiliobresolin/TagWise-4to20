import type { AuthenticatedUser } from '../auth/model';

export interface EvidenceMetadataSyncRequest {
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  evidenceId: string;
  fileName: string;
  mimeType: string | null;
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
  executionStepId: EvidenceMetadataSyncRequest['executionStepId'];
  source: EvidenceMetadataSyncRequest['source'];
  localCapturedAt: string;
  metadataIdempotencyKey: string;
  storageObjectKey: string | null;
  metadataReceivedAt: string;
  binaryUploadedAt: string | null;
  presenceFinalizedAt: string | null;
  presenceStatus: 'metadata-recorded' | 'binary-finalized';
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
