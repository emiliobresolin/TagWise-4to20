"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditEventRepository = void 0;
const node_crypto_1 = require("node:crypto");
class AuditEventRepository {
    database;
    constructor(database) {
        this.database = database;
    }
    async writeEvent(input) {
        const record = {
            id: (0, node_crypto_1.randomUUID)(),
            actorId: input.actorId,
            actorRole: input.actorRole,
            actionType: input.actionType,
            targetObjectType: input.targetObjectType,
            targetObjectId: input.targetObjectId,
            occurredAt: new Date().toISOString(),
            correlationId: input.correlationId,
            priorState: input.priorState ?? null,
            nextState: input.nextState ?? null,
            comment: input.comment ?? null,
            metadataJson: JSON.stringify(input.metadata ?? {}),
        };
        await this.database.query(`
        INSERT INTO audit_events (
          id,
          actor_id,
          actor_role,
          action_type,
          target_object_type,
          target_object_id,
          occurred_at,
          correlation_id,
          prior_state,
          next_state,
          comment,
          metadata_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb);
      `, [
            record.id,
            record.actorId,
            record.actorRole,
            record.actionType,
            record.targetObjectType,
            record.targetObjectId,
            record.occurredAt,
            record.correlationId,
            record.priorState,
            record.nextState,
            record.comment,
            record.metadataJson,
        ]);
        return record;
    }
    async listEventsByTarget(targetObjectType, targetObjectId) {
        const result = await this.database.query(`
        SELECT
          id,
          actor_id,
          actor_role,
          action_type,
          target_object_type,
          target_object_id,
          occurred_at,
          correlation_id,
          prior_state,
          next_state,
          comment,
          metadata_json
        FROM audit_events
        WHERE target_object_type = $1
          AND target_object_id = $2
        ORDER BY occurred_at ASC;
      `, [targetObjectType, targetObjectId]);
        return result.rows.map(mapAuditEventRow);
    }
}
exports.AuditEventRepository = AuditEventRepository;
function mapAuditEventRow(row) {
    return {
        id: row.id,
        actorId: row.actor_id,
        actorRole: row.actor_role,
        actionType: row.action_type,
        targetObjectType: row.target_object_type,
        targetObjectId: row.target_object_id,
        occurredAt: row.occurred_at,
        correlationId: row.correlation_id,
        priorState: row.prior_state,
        nextState: row.next_state,
        comment: row.comment,
        metadataJson: typeof row.metadata_json === 'string'
            ? row.metadata_json
            : JSON.stringify(row.metadata_json ?? {}),
    };
}
