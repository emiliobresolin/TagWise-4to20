import type { QueryResultRow } from 'pg';

import type { QueryableDatabase } from '../../platform/db/postgres';
import type {
  EvidenceMetadataSyncRecord,
  EvidenceMetadataSyncRequest,
} from './model';

interface EvidenceSyncRow extends QueryResultRow {
  server_evidence_id: string;
  owner_user_id: string;
  report_id: string;
  work_package_id: string;
  tag_id: string;
  template_id: string;
  template_version: string;
  evidence_id: string;
  file_name: string;
  mime_type: string | null;
  file_size_bytes: number;
  execution_step_id: EvidenceMetadataSyncRequest['executionStepId'];
  source: EvidenceMetadataSyncRequest['source'];
  local_captured_at: string;
  metadata_idempotency_key: string;
  storage_object_key: string | null;
  metadata_received_at: string;
  binary_uploaded_at: string | null;
  presence_finalized_at: string | null;
  presence_status: EvidenceMetadataSyncRecord['presenceStatus'];
  retention_policy: string;
  retention_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export class EvidenceSyncRepository {
  constructor(private readonly database: QueryableDatabase) {}

  async upsertMetadata(
    record: EvidenceMetadataSyncRecord,
  ): Promise<EvidenceMetadataSyncRecord> {
    await this.database.query(
      `
        INSERT INTO evidence_sync_records (
          server_evidence_id,
          owner_user_id,
          report_id,
          work_package_id,
          tag_id,
          template_id,
          template_version,
          evidence_id,
          file_name,
          mime_type,
          file_size_bytes,
          execution_step_id,
          source,
          local_captured_at,
          metadata_idempotency_key,
          storage_object_key,
          metadata_received_at,
          binary_uploaded_at,
          presence_finalized_at,
          presence_status,
          retention_policy,
          retention_expires_at,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
          $22, $23, $24
        )
        ON CONFLICT (owner_user_id, report_id, evidence_id) DO UPDATE SET
          work_package_id = EXCLUDED.work_package_id,
          tag_id = EXCLUDED.tag_id,
          template_id = EXCLUDED.template_id,
          template_version = EXCLUDED.template_version,
          file_name = EXCLUDED.file_name,
          mime_type = EXCLUDED.mime_type,
          file_size_bytes = EXCLUDED.file_size_bytes,
          execution_step_id = EXCLUDED.execution_step_id,
          source = EXCLUDED.source,
          local_captured_at = EXCLUDED.local_captured_at,
          metadata_idempotency_key = EXCLUDED.metadata_idempotency_key,
          retention_policy = EXCLUDED.retention_policy,
          updated_at = EXCLUDED.updated_at
      `,
      [
        record.serverEvidenceId,
        record.ownerUserId,
        record.reportId,
        record.workPackageId,
        record.tagId,
        record.templateId,
        record.templateVersion,
        record.evidenceId,
        record.fileName,
        record.mimeType,
        record.fileSizeBytes,
        record.executionStepId,
        record.source,
        record.localCapturedAt,
        record.metadataIdempotencyKey,
        record.storageObjectKey,
        record.metadataReceivedAt,
        record.binaryUploadedAt,
        record.presenceFinalizedAt,
        record.presenceStatus,
        record.retentionPolicy,
        record.retentionExpiresAt,
        record.createdAt,
        record.updatedAt,
      ],
    );

    return this.getByNaturalKey(record.ownerUserId, record.reportId, record.evidenceId).then((reloaded) => {
      if (!reloaded) {
        throw new Error('Failed to reload evidence sync metadata after upsert.');
      }

      return reloaded;
    });
  }

  async getByNaturalKey(
    ownerUserId: string,
    reportId: string,
    evidenceId: string,
  ): Promise<EvidenceMetadataSyncRecord | null> {
    const result = await this.database.query<EvidenceSyncRow>(
      `
        SELECT
          server_evidence_id,
          owner_user_id,
          report_id,
          work_package_id,
          tag_id,
          template_id,
          template_version,
          evidence_id,
          file_name,
          mime_type,
          file_size_bytes,
          execution_step_id,
          source,
          local_captured_at,
          metadata_idempotency_key,
          storage_object_key,
          metadata_received_at,
          binary_uploaded_at,
          presence_finalized_at,
          presence_status,
          retention_policy,
          retention_expires_at,
          created_at,
          updated_at
        FROM evidence_sync_records
        WHERE owner_user_id = $1
          AND report_id = $2
          AND evidence_id = $3
        LIMIT 1;
      `,
      [ownerUserId, reportId, evidenceId],
    );

    const row = result.rows[0];
    return row ? mapEvidenceSyncRow(row) : null;
  }

  async getByServerEvidenceId(
    ownerUserId: string,
    serverEvidenceId: string,
  ): Promise<EvidenceMetadataSyncRecord | null> {
    const result = await this.database.query<EvidenceSyncRow>(
      `
        SELECT
          server_evidence_id,
          owner_user_id,
          report_id,
          work_package_id,
          tag_id,
          template_id,
          template_version,
          evidence_id,
          file_name,
          mime_type,
          file_size_bytes,
          execution_step_id,
          source,
          local_captured_at,
          metadata_idempotency_key,
          storage_object_key,
          metadata_received_at,
          binary_uploaded_at,
          presence_finalized_at,
          presence_status,
          retention_policy,
          retention_expires_at,
          created_at,
          updated_at
        FROM evidence_sync_records
        WHERE owner_user_id = $1
          AND server_evidence_id = $2
        LIMIT 1;
      `,
      [ownerUserId, serverEvidenceId],
    );

    const row = result.rows[0];
    return row ? mapEvidenceSyncRow(row) : null;
  }

  async getByServerEvidenceIdForAnyOwner(
    serverEvidenceId: string,
  ): Promise<EvidenceMetadataSyncRecord | null> {
    const result = await this.database.query<EvidenceSyncRow>(
      `
        SELECT
          server_evidence_id,
          owner_user_id,
          report_id,
          work_package_id,
          tag_id,
          template_id,
          template_version,
          evidence_id,
          file_name,
          mime_type,
          file_size_bytes,
          execution_step_id,
          source,
          local_captured_at,
          metadata_idempotency_key,
          storage_object_key,
          metadata_received_at,
          binary_uploaded_at,
          presence_finalized_at,
          presence_status,
          retention_policy,
          retention_expires_at,
          created_at,
          updated_at
        FROM evidence_sync_records
        WHERE server_evidence_id = $1
        LIMIT 1;
      `,
      [serverEvidenceId],
    );

    const row = result.rows[0];
    return row ? mapEvidenceSyncRow(row) : null;
  }

  async canUserAccessEvidence(input: {
    userId: string;
    userRole: 'technician' | 'supervisor' | 'manager';
    ownerUserId: string;
    reportId: string;
    workPackageId: string;
  }): Promise<boolean> {
    if (input.userRole === 'technician') {
      return input.userId === input.ownerUserId;
    }

    if (input.userRole === 'supervisor') {
      const result = await this.database.query<{ count: string }>(
        `
          SELECT COUNT(*) AS count
          FROM report_submission_records report
          INNER JOIN supervisor_review_routes route
            ON route.work_package_id = report.work_package_id
          WHERE route.supervisor_user_id = $1
            AND route.route_state = 'active'
            AND report.owner_user_id = $2
            AND report.report_id = $3
            AND report.work_package_id = $4;
        `,
        [input.userId, input.ownerUserId, input.reportId, input.workPackageId],
      );

      return Number(result.rows[0]?.count ?? 0) > 0;
    }

    const result = await this.database.query<{ count: string }>(
      `
        SELECT COUNT(*) AS count
        FROM manager_review_routes route
        WHERE route.manager_user_id = $1
          AND route.owner_user_id = $2
          AND route.report_id = $3
          AND route.route_state = 'active';
      `,
      [input.userId, input.ownerUserId, input.reportId],
    );

    return Number(result.rows[0]?.count ?? 0) > 0;
  }

  async setStorageObjectKey(
    ownerUserId: string,
    serverEvidenceId: string,
    storageObjectKey: string,
    updatedAt: string,
  ): Promise<EvidenceMetadataSyncRecord> {
    await this.database.query(
      `
        UPDATE evidence_sync_records
        SET storage_object_key = $3,
            updated_at = $4
        WHERE owner_user_id = $1
          AND server_evidence_id = $2;
      `,
      [ownerUserId, serverEvidenceId, storageObjectKey, updatedAt],
    );

    const reloaded = await this.getByServerEvidenceId(ownerUserId, serverEvidenceId);
    if (!reloaded) {
      throw new Error('Failed to reload evidence sync metadata after object key update.');
    }

    return reloaded;
  }

  async finalizeBinaryPresence(
    ownerUserId: string,
    serverEvidenceId: string,
    timestamps: {
      binaryUploadedAt: string;
      presenceFinalizedAt: string;
      retentionExpiresAt: string;
      retentionPolicy: string;
      updatedAt: string;
    },
  ): Promise<EvidenceMetadataSyncRecord> {
    await this.database.query(
      `
        UPDATE evidence_sync_records
        SET binary_uploaded_at = $3,
            presence_finalized_at = $4,
            presence_status = 'binary-finalized',
            retention_expires_at = $5,
            retention_policy = $6,
            updated_at = $7
        WHERE owner_user_id = $1
          AND server_evidence_id = $2;
      `,
      [
        ownerUserId,
        serverEvidenceId,
        timestamps.binaryUploadedAt,
        timestamps.presenceFinalizedAt,
        timestamps.retentionExpiresAt,
        timestamps.retentionPolicy,
        timestamps.updatedAt,
      ],
    );

    const reloaded = await this.getByServerEvidenceId(ownerUserId, serverEvidenceId);
    if (!reloaded) {
      throw new Error('Failed to reload evidence sync metadata after binary finalization.');
    }

    return reloaded;
  }
}

function mapEvidenceSyncRow(row: EvidenceSyncRow): EvidenceMetadataSyncRecord {
  return {
    serverEvidenceId: row.server_evidence_id,
    ownerUserId: row.owner_user_id,
    reportId: row.report_id,
    workPackageId: row.work_package_id,
    tagId: row.tag_id,
    templateId: row.template_id,
    templateVersion: row.template_version,
    evidenceId: row.evidence_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    executionStepId: row.execution_step_id,
    source: row.source,
    localCapturedAt: row.local_captured_at,
    metadataIdempotencyKey: row.metadata_idempotency_key,
    storageObjectKey: row.storage_object_key,
    metadataReceivedAt: row.metadata_received_at,
    binaryUploadedAt: row.binary_uploaded_at,
    presenceFinalizedAt: row.presence_finalized_at,
    presenceStatus: row.presence_status,
    retentionPolicy: row.retention_policy,
    retentionExpiresAt: row.retention_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
