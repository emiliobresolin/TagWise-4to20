import type { AuthenticatedUser } from '../auth/model';
import type { EvidenceObjectStorageClient } from '../../platform/storage/objectStorage';
import { EvidenceSyncRepository } from './evidenceSyncRepository';
import {
  calculateEvidenceRetentionExpiresAt,
  EVIDENCE_BINARY_POLICY,
  isAllowedEvidenceMimeType,
} from './evidencePolicy';
import {
  assertTechnician,
  EvidenceSyncError,
  type EvidenceBinaryAccessAuthorization,
  type EvidenceBinaryFinalizationResult,
  type EvidenceBinaryUploadAuthorization,
  type EvidenceMetadataSyncRecord,
  type EvidenceMetadataSyncRequest,
} from './model';

export class EvidenceSyncService {
  constructor(
    private readonly repository: EvidenceSyncRepository,
    private readonly objectStorage: EvidenceObjectStorageClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async syncEvidenceMetadata(
    user: AuthenticatedUser,
    request: EvidenceMetadataSyncRequest,
  ): Promise<EvidenceMetadataSyncRecord> {
    assertTechnician(user);
    const normalizedRequest = normalizeEvidenceMetadataRequest(request);

    const existing = await this.repository.getByNaturalKey(user.id, request.reportId, request.evidenceId);
    if (existing) {
      return existing;
    }

    const now = this.now().toISOString();

    return this.repository.upsertMetadata({
      serverEvidenceId: buildServerEvidenceId(user.id, request.reportId, request.evidenceId),
      ownerUserId: user.id,
      reportId: request.reportId,
      workPackageId: request.workPackageId,
      tagId: request.tagId,
      templateId: request.templateId,
      templateVersion: request.templateVersion,
      evidenceId: request.evidenceId,
      fileName: normalizedRequest.fileName,
      mimeType: normalizedRequest.mimeType,
      fileSizeBytes: normalizedRequest.fileSizeBytes,
      executionStepId: request.executionStepId,
      source: request.source,
      localCapturedAt: request.localCapturedAt,
      metadataIdempotencyKey: request.metadataIdempotencyKey,
      storageObjectKey: null,
      metadataReceivedAt: now,
      binaryUploadedAt: null,
      presenceFinalizedAt: null,
      presenceStatus: 'metadata-recorded',
      retentionPolicy: EVIDENCE_BINARY_POLICY.id,
      retentionExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async authorizeBinaryUpload(
    user: AuthenticatedUser,
    input: {
      reportId: string;
      evidenceId: string;
    },
  ): Promise<EvidenceBinaryUploadAuthorization> {
    assertTechnician(user);

    const record = await this.repository.getByNaturalKey(user.id, input.reportId, input.evidenceId);
    if (!record) {
      throw new EvidenceSyncError('Evidence metadata must sync before requesting binary upload.', 404);
    }

    const objectKey =
      record.storageObjectKey ??
      buildEvidenceObjectKey(user.id, input.reportId, record.serverEvidenceId, record.fileName);
    const updatedAt = this.now().toISOString();
    const persisted = await this.repository.setStorageObjectKey(
      user.id,
      record.serverEvidenceId,
      objectKey,
      updatedAt,
    );

    const authorization = await this.objectStorage.createBinaryUploadAuthorization({
      objectKey,
      contentType: persisted.mimeType ?? 'application/octet-stream',
      expiresInSeconds: EVIDENCE_BINARY_POLICY.uploadAuthorizationTtlSeconds,
    });

    return {
      serverEvidenceId: persisted.serverEvidenceId,
      reportId: persisted.reportId,
      evidenceId: persisted.evidenceId,
      objectKey,
      uploadUrl: authorization.uploadUrl,
      uploadMethod: authorization.uploadMethod,
      requiredHeaders: authorization.requiredHeaders,
      expiresAt: authorization.expiresAt,
    };
  }

  async finalizeBinaryUpload(
    user: AuthenticatedUser,
    input: {
      serverEvidenceId: string;
    },
  ): Promise<EvidenceBinaryFinalizationResult> {
    assertTechnician(user);

    const record = await this.repository.getByServerEvidenceId(user.id, input.serverEvidenceId);
    if (!record) {
      throw new EvidenceSyncError('Evidence metadata was not found for finalization.', 404);
    }

    if (!record.storageObjectKey) {
      throw new EvidenceSyncError('Evidence upload authorization must be requested before finalization.', 409);
    }

    const objectMetadata = await this.objectStorage.getObjectMetadata(record.storageObjectKey);
    if (!objectMetadata) {
      throw new EvidenceSyncError('Evidence binary is not present in object storage yet.', 409);
    }
    assertStoredEvidenceObjectMatchesPolicy(record, objectMetadata);

    if (record.presenceStatus === 'binary-finalized' && record.presenceFinalizedAt) {
      if (!record.retentionExpiresAt) {
        await this.repository.finalizeBinaryPresence(user.id, input.serverEvidenceId, {
          binaryUploadedAt: record.binaryUploadedAt ?? record.presenceFinalizedAt,
          presenceFinalizedAt: record.presenceFinalizedAt,
          retentionExpiresAt: calculateEvidenceRetentionExpiresAt(record.presenceFinalizedAt),
          retentionPolicy: EVIDENCE_BINARY_POLICY.id,
          updatedAt: this.now().toISOString(),
        });
      }

      return {
        serverEvidenceId: record.serverEvidenceId,
        reportId: record.reportId,
        evidenceId: record.evidenceId,
        presenceStatus: 'binary-finalized',
        presenceFinalizedAt: record.presenceFinalizedAt,
      };
    }

    const now = this.now().toISOString();
    const retentionExpiresAt = calculateEvidenceRetentionExpiresAt(now);
    const finalized = await this.repository.finalizeBinaryPresence(user.id, input.serverEvidenceId, {
      binaryUploadedAt: now,
      presenceFinalizedAt: now,
      retentionExpiresAt,
      retentionPolicy: EVIDENCE_BINARY_POLICY.id,
      updatedAt: now,
    });

    return {
      serverEvidenceId: finalized.serverEvidenceId,
      reportId: finalized.reportId,
      evidenceId: finalized.evidenceId,
      presenceStatus: 'binary-finalized',
      presenceFinalizedAt: finalized.presenceFinalizedAt ?? now,
    };
  }

  async authorizeBinaryAccess(
    user: AuthenticatedUser,
    input: {
      serverEvidenceId: string;
    },
  ): Promise<EvidenceBinaryAccessAuthorization> {
    const record = await this.repository.getByServerEvidenceIdForAnyOwner(input.serverEvidenceId);
    if (!record) {
      throw new EvidenceSyncError('Evidence metadata was not found for access.', 404);
    }

    const canAccess = await this.repository.canUserAccessEvidence({
      userId: user.id,
      userRole: user.role,
      ownerUserId: record.ownerUserId,
      reportId: record.reportId,
      workPackageId: record.workPackageId,
    });
    if (!canAccess) {
      throw new EvidenceSyncError('Evidence is not available in the authenticated scope.', 403);
    }

    if (record.presenceStatus !== 'binary-finalized' || !record.storageObjectKey) {
      throw new EvidenceSyncError('Evidence binary is not finalized for access yet.', 409);
    }

    const authorization = await this.objectStorage.createBinaryAccessAuthorization({
      objectKey: record.storageObjectKey,
      expiresInSeconds: EVIDENCE_BINARY_POLICY.accessAuthorizationTtlSeconds,
    });

    return {
      serverEvidenceId: record.serverEvidenceId,
      reportId: record.reportId,
      evidenceId: record.evidenceId,
      downloadUrl: authorization.downloadUrl,
      downloadMethod: authorization.downloadMethod,
      requiredHeaders: authorization.requiredHeaders,
      expiresAt: authorization.expiresAt,
    };
  }
}

function normalizeEvidenceMetadataRequest(request: EvidenceMetadataSyncRequest): {
  fileName: string;
  mimeType: NonNullable<EvidenceMetadataSyncRequest['mimeType']>;
  fileSizeBytes: number;
} {
  const fileName = normalizeFileName(request.fileName);
  const mimeType = normalizeMimeType(request.mimeType);
  const fileSizeBytes = normalizeFileSizeBytes(request.fileSizeBytes);
  assertFileExtensionMatchesMimeType(fileName, mimeType);

  return {
    fileName,
    mimeType,
    fileSizeBytes,
  };
}

function normalizeFileName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new EvidenceSyncError('Evidence metadata requires a fileName.', 400);
  }

  const normalized = value.trim();
  if (Buffer.byteLength(normalized, 'utf8') > EVIDENCE_BINARY_POLICY.fileNameMaxBytes) {
    throw new EvidenceSyncError(
      `Evidence fileName must not exceed ${EVIDENCE_BINARY_POLICY.fileNameMaxBytes} bytes.`,
      400,
    );
  }

  if (normalized.includes('/') || normalized.includes('\\')) {
    throw new EvidenceSyncError('Evidence fileName must not contain path separators.', 400);
  }

  return normalized;
}

function normalizeMimeType(value: unknown): NonNullable<EvidenceMetadataSyncRequest['mimeType']> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new EvidenceSyncError('Evidence file type must be declared.', 400);
  }

  const normalized = value.trim().toLowerCase();
  if (!isAllowedEvidenceMimeType(normalized)) {
    throw new EvidenceSyncError(
      `Evidence file type must be one of: ${EVIDENCE_BINARY_POLICY.allowedMimeTypes.join(', ')}.`,
      400,
    );
  }

  return normalized;
}

function normalizeFileSizeBytes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new EvidenceSyncError('Evidence fileSizeBytes must be a positive integer.', 400);
  }

  if (value > EVIDENCE_BINARY_POLICY.maxFileSizeBytes) {
    throw new EvidenceSyncError(
      `Evidence fileSizeBytes must not exceed ${EVIDENCE_BINARY_POLICY.maxFileSizeBytes} bytes.`,
      400,
    );
  }

  return value;
}

function assertFileExtensionMatchesMimeType(fileName: string, mimeType: string): void {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const allowedExtensions = allowedExtensionsByMimeType[mimeType] ?? [];
  if (!extension || !allowedExtensions.includes(extension)) {
    throw new EvidenceSyncError(
      `Evidence fileName extension must match ${mimeType}.`,
      400,
    );
  }
}

const allowedExtensionsByMimeType: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/heic': ['heic'],
  'image/heif': ['heif'],
  'image/webp': ['webp'],
};

function assertStoredEvidenceObjectMatchesPolicy(
  record: EvidenceMetadataSyncRecord,
  metadata: {
    contentLengthBytes: number | null;
    contentType: string | null;
  },
): void {
  if (
    typeof metadata.contentLengthBytes !== 'number' ||
    !Number.isInteger(metadata.contentLengthBytes) ||
    metadata.contentLengthBytes <= 0
  ) {
    throw new EvidenceSyncError(
      'Evidence binary size metadata is unavailable from object storage.',
      409,
    );
  }

  if (metadata.contentLengthBytes > EVIDENCE_BINARY_POLICY.maxFileSizeBytes) {
    throw new EvidenceSyncError(
      `Evidence binary object must not exceed ${EVIDENCE_BINARY_POLICY.maxFileSizeBytes} bytes.`,
      400,
    );
  }

  if (!record.mimeType) {
    throw new EvidenceSyncError('Evidence metadata file type is unavailable for finalization.', 409);
  }

  const contentType = normalizeStoredContentType(metadata.contentType);
  if (!contentType) {
    throw new EvidenceSyncError(
      'Evidence binary content type metadata is unavailable from object storage.',
      409,
    );
  }

  if (!isAllowedEvidenceMimeType(contentType)) {
    throw new EvidenceSyncError(
      `Evidence binary content type must be one of: ${EVIDENCE_BINARY_POLICY.allowedMimeTypes.join(', ')}.`,
      400,
    );
  }

  if (contentType !== record.mimeType) {
    throw new EvidenceSyncError(
      `Evidence binary content type must match declared metadata ${record.mimeType}.`,
      400,
    );
  }
}

function normalizeStoredContentType(value: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.split(';')[0]?.trim().toLowerCase() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function buildServerEvidenceId(ownerUserId: string, reportId: string, evidenceId: string): string {
  return `evidence-sync:${ownerUserId}:${reportId}:${evidenceId}`;
}

function buildEvidenceObjectKey(
  ownerUserId: string,
  reportId: string,
  serverEvidenceId: string,
  fileName: string,
): string {
  return [
    'evidence',
    sanitizeObjectKeySegment(ownerUserId),
    sanitizeObjectKeySegment(reportId),
    sanitizeObjectKeySegment(serverEvidenceId),
    sanitizeObjectKeySegment(fileName),
  ].join('/');
}

function sanitizeObjectKeySegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}
