import type { QueryResultRow } from 'pg';

import type { QueryableDatabase } from '../../platform/db/postgres';
import type {
  ReportSubmissionApprovalHistoryItem,
  ReportSubmissionRecord,
} from './model';

interface ReportSubmissionRow extends QueryResultRow {
  owner_user_id: string;
  report_id: string;
  work_package_id: string;
  tag_id: string;
  template_id: string;
  template_version: string;
  local_object_version: string;
  idempotency_key: string;
  server_report_version: string;
  report_state: ReportSubmissionRecord['reportState'];
  lifecycle_state: ReportSubmissionRecord['lifecycleState'];
  sync_state: ReportSubmissionRecord['syncState'];
  submitted_at: string;
  accepted_at: string;
  payload_json: unknown;
  created_at: string;
  updated_at: string;
}

interface ApprovalHistoryRow extends QueryResultRow {
  id: string;
  actor_role: string;
  action_type: string;
  occurred_at: string;
  correlation_id: string;
  prior_state: string | null;
  next_state: string | null;
  comment: string | null;
}

export class ReportSubmissionRepository {
  constructor(private readonly database: QueryableDatabase) {}

  async getByReportId(ownerUserId: string, reportId: string): Promise<ReportSubmissionRecord | null> {
    const result = await this.database.query<ReportSubmissionRow>(
      `
        SELECT
          owner_user_id,
          report_id,
          work_package_id,
          tag_id,
          template_id,
          template_version,
          local_object_version,
          idempotency_key,
          server_report_version,
          report_state,
          lifecycle_state,
          sync_state,
          submitted_at,
          accepted_at,
          payload_json,
          created_at,
          updated_at
        FROM report_submission_records
        WHERE owner_user_id = $1
          AND report_id = $2
        LIMIT 1;
      `,
      [ownerUserId, reportId],
    );

    const row = result.rows[0];
    return row ? mapReportSubmissionRow(row) : null;
  }

  async insertAcceptedOrGetExisting(record: ReportSubmissionRecord): Promise<ReportSubmissionRecord> {
    await this.database.query(
      `
        INSERT INTO report_submission_records (
          owner_user_id,
          report_id,
          work_package_id,
          tag_id,
          template_id,
          template_version,
          local_object_version,
          idempotency_key,
          server_report_version,
          report_state,
          lifecycle_state,
          sync_state,
          submitted_at,
          accepted_at,
          payload_json,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17
        )
        ON CONFLICT (owner_user_id, report_id) DO NOTHING;
      `,
      [
        record.ownerUserId,
        record.reportId,
        record.workPackageId,
        record.tagId,
        record.templateId,
        record.templateVersion,
        record.localObjectVersion,
        record.idempotencyKey,
        record.serverReportVersion,
        record.reportState,
        record.lifecycleState,
        record.syncState,
        record.submittedAt,
        record.acceptedAt,
        JSON.stringify(record.payloadJson),
        record.createdAt,
        record.updatedAt,
      ],
    );

    const reloaded = await this.getByReportId(record.ownerUserId, record.reportId);
    if (!reloaded) {
      throw new Error('Failed to reload accepted report submission.');
    }

    return reloaded;
  }

  async replaceReturnedWithAccepted(
    record: ReportSubmissionRecord,
  ): Promise<ReportSubmissionRecord | null> {
    const result = await this.database.query<ReportSubmissionRow>(
      `
        UPDATE report_submission_records
        SET
          work_package_id = $3,
          tag_id = $4,
          template_id = $5,
          template_version = $6,
          local_object_version = $7,
          idempotency_key = $8,
          server_report_version = $9,
          report_state = $10,
          lifecycle_state = $11,
          sync_state = $12,
          submitted_at = $13,
          accepted_at = $14,
          payload_json = $15::jsonb,
          updated_at = $16
        WHERE owner_user_id = $1
          AND report_id = $2
          AND lifecycle_state IN ('Returned by Supervisor', 'Returned by Manager')
        RETURNING
          owner_user_id,
          report_id,
          work_package_id,
          tag_id,
          template_id,
          template_version,
          local_object_version,
          idempotency_key,
          server_report_version,
          report_state,
          lifecycle_state,
          sync_state,
          submitted_at,
          accepted_at,
          payload_json,
          created_at,
          updated_at;
      `,
      [
        record.ownerUserId,
        record.reportId,
        record.workPackageId,
        record.tagId,
        record.templateId,
        record.templateVersion,
        record.localObjectVersion,
        record.idempotencyKey,
        record.serverReportVersion,
        record.reportState,
        record.lifecycleState,
        record.syncState,
        record.submittedAt,
        record.acceptedAt,
        JSON.stringify(record.payloadJson),
        record.updatedAt,
      ],
    );

    const row = result.rows[0];
    return row ? mapReportSubmissionRow(row) : null;
  }

  async listReportApprovalHistory(
    reportId: string,
  ): Promise<ReportSubmissionApprovalHistoryItem[]> {
    const result = await this.database.query<ApprovalHistoryRow>(
      `
        SELECT
          id,
          actor_role,
          action_type,
          occurred_at,
          correlation_id,
          prior_state,
          next_state,
          comment
        FROM audit_events
        WHERE target_object_type = 'report'
          AND target_object_id = $1
          AND action_type IN (
            'report.supervisor.approved',
            'report.supervisor.returned',
            'report.supervisor.escalated',
            'report.manager.approved',
            'report.manager.returned'
          )
        ORDER BY occurred_at ASC, id ASC;
      `,
      [reportId],
    );

    return result.rows.map((row) => ({
      auditEventId: row.id,
      actorRole: row.actor_role,
      actionType: row.action_type,
      occurredAt: row.occurred_at,
      correlationId: row.correlation_id,
      priorState: row.prior_state,
      nextState: row.next_state,
      comment: row.comment,
    }));
  }
}

function mapReportSubmissionRow(row: ReportSubmissionRow): ReportSubmissionRecord {
  return {
    ownerUserId: row.owner_user_id,
    reportId: row.report_id,
    workPackageId: row.work_package_id,
    tagId: row.tag_id,
    templateId: row.template_id,
    templateVersion: row.template_version,
    localObjectVersion: row.local_object_version,
    idempotencyKey: row.idempotency_key,
    serverReportVersion: row.server_report_version,
    reportState: row.report_state,
    lifecycleState: row.lifecycle_state,
    syncState: row.sync_state,
    submittedAt: row.submitted_at,
    acceptedAt: row.accepted_at,
    payloadJson: row.payload_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
