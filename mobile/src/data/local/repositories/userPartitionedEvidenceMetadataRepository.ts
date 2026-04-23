import type { LocalDatabase } from '../sqlite/types';
import type {
  LocalBusinessObjectIdentity,
  UserOwnedEvidenceMetadataRecord,
} from './userPartitionedLocalTypes';

interface EvidenceRow {
  owner_user_id: string;
  evidence_id: string;
  business_object_type: string;
  business_object_id: string;
  file_name: string;
  media_relative_path: string;
  mime_type: string | null;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

export class UserPartitionedEvidenceMetadataRepository {
  constructor(
    private readonly database: LocalDatabase,
    readonly ownerUserId: string,
  ) {}

  async saveEvidenceMetadata(
    input: LocalBusinessObjectIdentity & {
      evidenceId: string;
      fileName: string;
      mediaRelativePath: string;
      mimeType?: string | null;
      payloadJson: string;
    },
  ): Promise<UserOwnedEvidenceMetadataRecord> {
    const now = new Date().toISOString();

    await this.database.runAsync(
      `
        INSERT INTO user_partitioned_evidence_metadata (
          owner_user_id,
          evidence_id,
          business_object_type,
          business_object_id,
          file_name,
          media_relative_path,
          mime_type,
          payload_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_user_id, evidence_id) DO UPDATE SET
          business_object_type = excluded.business_object_type,
          business_object_id = excluded.business_object_id,
          file_name = excluded.file_name,
          media_relative_path = excluded.media_relative_path,
          mime_type = excluded.mime_type,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at;
      `,
      [
        this.ownerUserId,
        input.evidenceId,
        input.businessObjectType,
        input.businessObjectId,
        input.fileName,
        input.mediaRelativePath,
        input.mimeType ?? null,
        input.payloadJson,
        now,
        now,
      ],
    );

    const record = await this.getEvidenceById(input.evidenceId);
    if (!record) {
      throw new Error('Failed to reload user-owned evidence metadata after save.');
    }

    return record;
  }

  async getEvidenceById(evidenceId: string): Promise<UserOwnedEvidenceMetadataRecord | null> {
    const row = await this.database.getFirstAsync<EvidenceRow>(
      `
        SELECT
          owner_user_id,
          evidence_id,
          business_object_type,
          business_object_id,
          file_name,
          media_relative_path,
          mime_type,
          payload_json,
          created_at,
          updated_at
        FROM user_partitioned_evidence_metadata
        WHERE owner_user_id = ?
          AND evidence_id = ?;
      `,
      [this.ownerUserId, evidenceId],
    );

    return row ? mapEvidenceRow(row) : null;
  }

  async listEvidenceByBusinessObject(
    input: LocalBusinessObjectIdentity,
  ): Promise<UserOwnedEvidenceMetadataRecord[]> {
    const rows = await this.database.getAllAsync<EvidenceRow>(
      `
        SELECT
          owner_user_id,
          evidence_id,
          business_object_type,
          business_object_id,
          file_name,
          media_relative_path,
          mime_type,
          payload_json,
          created_at,
          updated_at
        FROM user_partitioned_evidence_metadata
        WHERE owner_user_id = ?
          AND business_object_type = ?
          AND business_object_id = ?
        ORDER BY created_at ASC, evidence_id ASC;
      `,
      [this.ownerUserId, input.businessObjectType, input.businessObjectId],
    );

    return rows.map(mapEvidenceRow);
  }

  async deleteEvidenceMetadata(evidenceId: string): Promise<void> {
    await this.database.runAsync(
      `
        DELETE FROM user_partitioned_evidence_metadata
        WHERE owner_user_id = ?
          AND evidence_id = ?;
      `,
      [this.ownerUserId, evidenceId],
    );
  }
}

function mapEvidenceRow(row: EvidenceRow): UserOwnedEvidenceMetadataRecord {
  return {
    ownerUserId: row.owner_user_id,
    evidenceId: row.evidence_id,
    businessObjectType: row.business_object_type,
    businessObjectId: row.business_object_id,
    fileName: row.file_name,
    mediaRelativePath: row.media_relative_path,
    mimeType: row.mime_type,
    payloadJson: row.payload_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
