import type { LocalDatabase } from '../sqlite/types';
import type { LocalBusinessObjectIdentity, UserOwnedDraftRecord } from './userPartitionedLocalTypes';

interface DraftRow {
  owner_user_id: string;
  business_object_type: string;
  business_object_id: string;
  summary_text: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

export class UserPartitionedDraftRepository {
  constructor(
    private readonly database: LocalDatabase,
    readonly ownerUserId: string,
  ) {}

  async saveDraft(
    input: LocalBusinessObjectIdentity & {
      summaryText: string;
      payloadJson: string;
    },
  ): Promise<UserOwnedDraftRecord> {
    const now = new Date().toISOString();

    await this.database.runAsync(
      `
        INSERT INTO user_partitioned_drafts (
          owner_user_id,
          business_object_type,
          business_object_id,
          summary_text,
          payload_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_user_id, business_object_type, business_object_id) DO UPDATE SET
          summary_text = excluded.summary_text,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at;
      `,
      [
        this.ownerUserId,
        input.businessObjectType,
        input.businessObjectId,
        input.summaryText,
        input.payloadJson,
        now,
        now,
      ],
    );

    const record = await this.getDraft(input);
    if (!record) {
      throw new Error('Failed to reload user-owned draft after save.');
    }

    return record;
  }

  async getDraft(input: LocalBusinessObjectIdentity): Promise<UserOwnedDraftRecord | null> {
    const row = await this.database.getFirstAsync<DraftRow>(
      `
        SELECT
          owner_user_id,
          business_object_type,
          business_object_id,
          summary_text,
          payload_json,
          created_at,
          updated_at
        FROM user_partitioned_drafts
        WHERE owner_user_id = ?
          AND business_object_type = ?
          AND business_object_id = ?;
      `,
      [this.ownerUserId, input.businessObjectType, input.businessObjectId],
    );

    return row ? mapDraftRow(row) : null;
  }

  async listDrafts(): Promise<UserOwnedDraftRecord[]> {
    const rows = await this.database.getAllAsync<DraftRow>(
      `
        SELECT
          owner_user_id,
          business_object_type,
          business_object_id,
          summary_text,
          payload_json,
          created_at,
          updated_at
        FROM user_partitioned_drafts
        WHERE owner_user_id = ?
        ORDER BY business_object_type ASC, business_object_id ASC;
      `,
      [this.ownerUserId],
    );

    return rows.map(mapDraftRow);
  }
}

function mapDraftRow(row: DraftRow): UserOwnedDraftRecord {
  return {
    ownerUserId: row.owner_user_id,
    businessObjectType: row.business_object_type,
    businessObjectId: row.business_object_id,
    summaryText: row.summary_text,
    payloadJson: row.payload_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
