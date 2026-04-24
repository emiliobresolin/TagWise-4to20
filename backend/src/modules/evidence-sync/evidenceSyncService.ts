import type { AuthenticatedUser } from '../auth/model';
import type { EvidenceObjectStorageClient } from '../../platform/storage/objectStorage';
import { EvidenceSyncRepository } from './evidenceSyncRepository';
import {
  assertTechnician,
  EvidenceSyncError,
  type EvidenceBinaryFinalizationResult,
  type EvidenceBinaryUploadAuthorization,
  type EvidenceMetadataSyncRecord,
  type EvidenceMetadataSyncRequest,
} from './model';

const DEFAULT_UPLOAD_AUTHORIZATION_TTL_SECONDS = 15 * 60;

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
      fileName: request.fileName,
      mimeType: request.mimeType,
      executionStepId: request.executionStepId,
      source: request.source,
      localCapturedAt: request.localCapturedAt,
      metadataIdempotencyKey: request.metadataIdempotencyKey,
      storageObjectKey: null,
      metadataReceivedAt: now,
      binaryUploadedAt: null,
      presenceFinalizedAt: null,
      presenceStatus: 'metadata-recorded',
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
      expiresInSeconds: DEFAULT_UPLOAD_AUTHORIZATION_TTL_SECONDS,
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

    const objectExists = await this.objectStorage.hasObject(record.storageObjectKey);
    if (!objectExists) {
      throw new EvidenceSyncError('Evidence binary is not present in object storage yet.', 409);
    }

    if (record.presenceStatus === 'binary-finalized' && record.presenceFinalizedAt) {
      return {
        serverEvidenceId: record.serverEvidenceId,
        reportId: record.reportId,
        evidenceId: record.evidenceId,
        presenceStatus: 'binary-finalized',
        presenceFinalizedAt: record.presenceFinalizedAt,
      };
    }

    const now = this.now().toISOString();
    const finalized = await this.repository.finalizeBinaryPresence(user.id, input.serverEvidenceId, {
      binaryUploadedAt: now,
      presenceFinalizedAt: now,
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
