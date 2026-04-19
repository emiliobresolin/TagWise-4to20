import type { LocalDatabase } from '../sqlite/types';
import type { LocalBusinessObjectIdentity, UserOwnedQueueItemRecord } from './userPartitionedLocalTypes';

interface QueueRow {
  owner_user_id: string;
  queue_item_id: string;
  business_object_type: string;
  business_object_id: string;
  item_kind: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

export class UserPartitionedQueueItemRepository {
  constructor(
    private readonly database: LocalDatabase,
    readonly ownerUserId: string,
  ) {}

  async enqueue(
    input: LocalBusinessObjectIdentity & {
      queueItemId: string;
      itemKind: string;
      payloadJson: string;
    },
  ): Promise<UserOwnedQueueItemRecord> {
    const now = new Date().toISOString();

    await this.database.runAsync(
      `
        INSERT INTO user_partitioned_queue_items (
          owner_user_id,
          queue_item_id,
          business_object_type,
          business_object_id,
          item_kind,
          payload_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_user_id, queue_item_id) DO UPDATE SET
          business_object_type = excluded.business_object_type,
          business_object_id = excluded.business_object_id,
          item_kind = excluded.item_kind,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at;
      `,
      [
        this.ownerUserId,
        input.queueItemId,
        input.businessObjectType,
        input.businessObjectId,
        input.itemKind,
        input.payloadJson,
        now,
        now,
      ],
    );

    const record = await this.getQueueItemById(input.queueItemId);
    if (!record) {
      throw new Error('Failed to reload user-owned queue item after enqueue.');
    }

    return record;
  }

  async getQueueItemById(queueItemId: string): Promise<UserOwnedQueueItemRecord | null> {
    const row = await this.database.getFirstAsync<QueueRow>(
      `
        SELECT
          owner_user_id,
          queue_item_id,
          business_object_type,
          business_object_id,
          item_kind,
          payload_json,
          created_at,
          updated_at
        FROM user_partitioned_queue_items
        WHERE owner_user_id = ?
          AND queue_item_id = ?;
      `,
      [this.ownerUserId, queueItemId],
    );

    return row ? mapQueueRow(row) : null;
  }

  async listQueueItemsByBusinessObject(
    input: LocalBusinessObjectIdentity,
  ): Promise<UserOwnedQueueItemRecord[]> {
    const rows = await this.database.getAllAsync<QueueRow>(
      `
        SELECT
          owner_user_id,
          queue_item_id,
          business_object_type,
          business_object_id,
          item_kind,
          payload_json,
          created_at,
          updated_at
        FROM user_partitioned_queue_items
        WHERE owner_user_id = ?
          AND business_object_type = ?
          AND business_object_id = ?
        ORDER BY queue_item_id ASC;
      `,
      [this.ownerUserId, input.businessObjectType, input.businessObjectId],
    );

    return rows.map(mapQueueRow);
  }
}

function mapQueueRow(row: QueueRow): UserOwnedQueueItemRecord {
  return {
    ownerUserId: row.owner_user_id,
    queueItemId: row.queue_item_id,
    businessObjectType: row.business_object_type,
    businessObjectId: row.business_object_id,
    itemKind: row.item_kind,
    payloadJson: row.payload_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
