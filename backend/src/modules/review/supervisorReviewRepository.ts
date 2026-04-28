import { randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';

import type { AuditEventRecord } from '../audit/model';
import type { QueryableDatabase } from '../../platform/db/postgres';
import type {
  ManagerReviewDecisionResponse,
  ReviewableReportRecord,
  SupervisorReviewApprovalHistoryItem,
  SupervisorReviewDecisionResponse,
} from './model';

interface ReviewableReportRow extends QueryResultRow {
  owner_user_id: string;
  report_id: string;
  work_package_id: string;
  tag_id: string;
  template_id: string;
  template_version: string;
  server_report_version: string;
  report_state: ReviewableReportRecord['reportState'];
  lifecycle_state: ReviewableReportRecord['lifecycleState'];
  sync_state: ReviewableReportRecord['syncState'];
  submitted_at: string;
  accepted_at: string;
  payload_json: unknown;
}

interface SupervisorDecisionRow extends ReviewableReportRow {
  audit_id: string;
  audit_actor_id: string;
  audit_actor_role: AuditEventRecord['actorRole'];
  audit_action_type: string;
  audit_target_object_type: string;
  audit_target_object_id: string;
  audit_occurred_at: string;
  audit_correlation_id: string;
  audit_prior_state: string | null;
  audit_next_state: string | null;
  audit_comment: string | null;
  audit_metadata_json: unknown;
  routed_manager_user_id?: string;
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

export interface SupervisorDecisionPersistenceResult {
  report: ReviewableReportRecord;
  auditEvent: AuditEventRecord;
  managerReviewerUserId?: string;
}

export class SupervisorReviewRepository {
  constructor(private readonly database: QueryableDatabase) {}

  async upsertSupervisorRoute(input: {
    supervisorUserId: string;
    workPackageId: string;
    routedAt: string;
  }): Promise<void> {
    await this.database.query(
      `
        INSERT INTO supervisor_review_routes (
          supervisor_user_id,
          work_package_id,
          route_state,
          routed_at
        )
        VALUES ($1, $2, 'active', $3)
        ON CONFLICT (supervisor_user_id, work_package_id) DO UPDATE SET
          route_state = 'active',
          routed_at = EXCLUDED.routed_at;
      `,
      [input.supervisorUserId, input.workPackageId, input.routedAt],
    );
  }

  async listSupervisorQueue(supervisorUserId: string): Promise<ReviewableReportRecord[]> {
    const result = await this.database.query<ReviewableReportRow>(
      `
        SELECT
          report.owner_user_id,
          report.report_id,
          report.work_package_id,
          report.tag_id,
          report.template_id,
          report.template_version,
          report.server_report_version,
          report.report_state,
          report.lifecycle_state,
          report.sync_state,
          report.submitted_at,
          report.accepted_at,
          report.payload_json
        FROM report_submission_records report
        INNER JOIN supervisor_review_routes route
          ON route.work_package_id = report.work_package_id
        WHERE route.supervisor_user_id = $1
          AND route.route_state = 'active'
          AND report.lifecycle_state = 'Submitted - Pending Supervisor Review'
        ORDER BY report.accepted_at ASC, report.report_id ASC;
      `,
      [supervisorUserId],
    );

    return result.rows.map(mapReviewableReportRow);
  }

  async getSupervisorReportDetail(
    supervisorUserId: string,
    reportId: string,
  ): Promise<ReviewableReportRecord | null> {
    const result = await this.database.query<ReviewableReportRow>(
      `
        SELECT
          report.owner_user_id,
          report.report_id,
          report.work_package_id,
          report.tag_id,
          report.template_id,
          report.template_version,
          report.server_report_version,
          report.report_state,
          report.lifecycle_state,
          report.sync_state,
          report.submitted_at,
          report.accepted_at,
          report.payload_json
        FROM report_submission_records report
        INNER JOIN supervisor_review_routes route
          ON route.work_package_id = report.work_package_id
        WHERE route.supervisor_user_id = $1
          AND route.route_state = 'active'
          AND report.report_id = $2
          AND report.lifecycle_state = 'Submitted - Pending Supervisor Review'
        LIMIT 1;
      `,
      [supervisorUserId, reportId],
    );

    const row = result.rows[0];
    return row ? mapReviewableReportRow(row) : null;
  }

  async listReportApprovalHistory(reportId: string): Promise<SupervisorReviewApprovalHistoryItem[]> {
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

  async getSupervisorRoutedReportById(
    supervisorUserId: string,
    reportId: string,
  ): Promise<ReviewableReportRecord | null> {
    const result = await this.database.query<ReviewableReportRow>(
      `
        SELECT
          report.owner_user_id,
          report.report_id,
          report.work_package_id,
          report.tag_id,
          report.template_id,
          report.template_version,
          report.server_report_version,
          report.report_state,
          report.lifecycle_state,
          report.sync_state,
          report.submitted_at,
          report.accepted_at,
          report.payload_json
        FROM report_submission_records report
        INNER JOIN supervisor_review_routes route
          ON route.work_package_id = report.work_package_id
        WHERE route.supervisor_user_id = $1
          AND route.route_state = 'active'
          AND report.report_id = $2
        LIMIT 1;
      `,
      [supervisorUserId, reportId],
    );

    const row = result.rows[0];
    return row ? mapReviewableReportRow(row) : null;
  }

  async listManagerQueue(managerUserId: string): Promise<ReviewableReportRecord[]> {
    const result = await this.database.query<ReviewableReportRow>(
      `
        SELECT
          report.owner_user_id,
          report.report_id,
          report.work_package_id,
          report.tag_id,
          report.template_id,
          report.template_version,
          report.server_report_version,
          report.report_state,
          report.lifecycle_state,
          report.sync_state,
          report.submitted_at,
          report.accepted_at,
          report.payload_json
        FROM report_submission_records report
        INNER JOIN manager_review_routes route
          ON route.owner_user_id = report.owner_user_id
          AND route.report_id = report.report_id
        WHERE route.manager_user_id = $1
          AND route.route_state = 'active'
          AND report.lifecycle_state = 'Escalated - Pending Manager Review'
        ORDER BY route.routed_at ASC, report.report_id ASC;
      `,
      [managerUserId],
    );

    return result.rows.map(mapReviewableReportRow);
  }

  async getManagerReportDetail(
    managerUserId: string,
    reportId: string,
  ): Promise<ReviewableReportRecord | null> {
    const result = await this.database.query<ReviewableReportRow>(
      `
        SELECT
          report.owner_user_id,
          report.report_id,
          report.work_package_id,
          report.tag_id,
          report.template_id,
          report.template_version,
          report.server_report_version,
          report.report_state,
          report.lifecycle_state,
          report.sync_state,
          report.submitted_at,
          report.accepted_at,
          report.payload_json
        FROM report_submission_records report
        INNER JOIN manager_review_routes route
          ON route.owner_user_id = report.owner_user_id
          AND route.report_id = report.report_id
        WHERE route.manager_user_id = $1
          AND route.route_state = 'active'
          AND report.report_id = $2
          AND report.lifecycle_state = 'Escalated - Pending Manager Review'
        LIMIT 1;
      `,
      [managerUserId, reportId],
    );

    const row = result.rows[0];
    return row ? mapReviewableReportRow(row) : null;
  }

  async getManagerRoutedReportById(
    managerUserId: string,
    reportId: string,
  ): Promise<ReviewableReportRecord | null> {
    const result = await this.database.query<ReviewableReportRow>(
      `
        SELECT
          report.owner_user_id,
          report.report_id,
          report.work_package_id,
          report.tag_id,
          report.template_id,
          report.template_version,
          report.server_report_version,
          report.report_state,
          report.lifecycle_state,
          report.sync_state,
          report.submitted_at,
          report.accepted_at,
          report.payload_json
        FROM report_submission_records report
        INNER JOIN manager_review_routes route
          ON route.owner_user_id = report.owner_user_id
          AND route.report_id = report.report_id
        WHERE route.manager_user_id = $1
          AND route.route_state = 'active'
          AND report.report_id = $2
        LIMIT 1;
      `,
      [managerUserId, reportId],
    );

    const row = result.rows[0];
    return row ? mapReviewableReportRow(row) : null;
  }

  async recordSupervisorDecision(input: {
    supervisorUserId: string;
    actorRole: AuditEventRecord['actorRole'];
    ownerUserId: string;
    reportId: string;
    reportState: SupervisorReviewDecisionResponse['reportState'];
    lifecycleState: SupervisorReviewDecisionResponse['lifecycleState'];
    decidedAt: string;
    correlationId: string;
    actionType: string;
    priorState: string;
    comment: string | null;
    metadata: Record<string, unknown>;
  }): Promise<SupervisorDecisionPersistenceResult | null> {
    const auditEventId = randomUUID();
    const result = await this.database.query<SupervisorDecisionRow>(
      `
        WITH updated AS (
          UPDATE report_submission_records
          SET
            report_state = $3,
            lifecycle_state = $4,
            sync_state = 'synced',
            updated_at = $5
          WHERE owner_user_id = $13
            AND report_id = $2
            AND lifecycle_state = $6
          RETURNING
            owner_user_id,
            report_id,
            work_package_id,
            tag_id,
            template_id,
            template_version,
            server_report_version,
            report_state,
            lifecycle_state,
            sync_state,
            submitted_at,
            accepted_at,
            payload_json
        ),
        audit AS (
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
          SELECT
            $7,
            $1,
            $8,
            $9,
            'report',
            updated.report_id,
            $5,
            $10,
            $6,
            $4,
            $11,
            $12::jsonb
          FROM updated
          RETURNING
            id AS audit_id,
            actor_id AS audit_actor_id,
            actor_role AS audit_actor_role,
            action_type AS audit_action_type,
            target_object_type AS audit_target_object_type,
            target_object_id AS audit_target_object_id,
            occurred_at AS audit_occurred_at,
            correlation_id AS audit_correlation_id,
            prior_state AS audit_prior_state,
            next_state AS audit_next_state,
            comment AS audit_comment,
            metadata_json AS audit_metadata_json
        )
        SELECT
          updated.owner_user_id,
          updated.report_id,
          updated.work_package_id,
          updated.tag_id,
          updated.template_id,
          updated.template_version,
          updated.server_report_version,
          updated.report_state,
          updated.lifecycle_state,
          updated.sync_state,
          updated.submitted_at,
          updated.accepted_at,
          updated.payload_json,
          audit.audit_id,
          audit.audit_actor_id,
          audit.audit_actor_role,
          audit.audit_action_type,
          audit.audit_target_object_type,
          audit.audit_target_object_id,
          audit.audit_occurred_at,
          audit.audit_correlation_id,
          audit.audit_prior_state,
          audit.audit_next_state,
          audit.audit_comment,
          audit.audit_metadata_json
        FROM updated, audit;
      `,
      [
        input.supervisorUserId,
        input.reportId,
        input.reportState,
        input.lifecycleState,
        input.decidedAt,
        input.priorState,
        auditEventId,
        input.actorRole,
        input.actionType,
        input.correlationId,
        input.comment,
        JSON.stringify(input.metadata),
        input.ownerUserId,
      ],
    );

    const row = result.rows[0];
    return row
      ? {
          report: mapReviewableReportRow(row),
          auditEvent: mapSupervisorDecisionAuditEvent(row),
        }
      : null;
  }

  async recordManagerDecision(input: {
    managerUserId: string;
    actorRole: AuditEventRecord['actorRole'];
    ownerUserId: string;
    reportId: string;
    reportState: ManagerReviewDecisionResponse['reportState'];
    lifecycleState: ManagerReviewDecisionResponse['lifecycleState'];
    decidedAt: string;
    correlationId: string;
    actionType: string;
    priorState: string;
    comment: string | null;
    metadata: Record<string, unknown>;
  }): Promise<SupervisorDecisionPersistenceResult | null> {
    const auditEventId = randomUUID();
    const result = await this.database.query<SupervisorDecisionRow>(
      `
        WITH updated AS (
          UPDATE report_submission_records
          SET
            report_state = $3,
            lifecycle_state = $4,
            sync_state = 'synced',
            updated_at = $5
          WHERE owner_user_id = $13
            AND report_id = $2
            AND lifecycle_state = $6
          RETURNING
            owner_user_id,
            report_id,
            work_package_id,
            tag_id,
            template_id,
            template_version,
            server_report_version,
            report_state,
            lifecycle_state,
            sync_state,
            submitted_at,
            accepted_at,
            payload_json
        ),
        audit AS (
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
          SELECT
            $7,
            $1,
            $8,
            $9,
            'report',
            updated.report_id,
            $5,
            $10,
            $6,
            $4,
            $11,
            $12::jsonb
          FROM updated
          RETURNING
            id AS audit_id,
            actor_id AS audit_actor_id,
            actor_role AS audit_actor_role,
            action_type AS audit_action_type,
            target_object_type AS audit_target_object_type,
            target_object_id AS audit_target_object_id,
            occurred_at AS audit_occurred_at,
            correlation_id AS audit_correlation_id,
            prior_state AS audit_prior_state,
            next_state AS audit_next_state,
            comment AS audit_comment,
            metadata_json AS audit_metadata_json
        )
        SELECT
          updated.owner_user_id,
          updated.report_id,
          updated.work_package_id,
          updated.tag_id,
          updated.template_id,
          updated.template_version,
          updated.server_report_version,
          updated.report_state,
          updated.lifecycle_state,
          updated.sync_state,
          updated.submitted_at,
          updated.accepted_at,
          updated.payload_json,
          audit.audit_id,
          audit.audit_actor_id,
          audit.audit_actor_role,
          audit.audit_action_type,
          audit.audit_target_object_type,
          audit.audit_target_object_id,
          audit.audit_occurred_at,
          audit.audit_correlation_id,
          audit.audit_prior_state,
          audit.audit_next_state,
          audit.audit_comment,
          audit.audit_metadata_json
        FROM updated, audit;
      `,
      [
        input.managerUserId,
        input.reportId,
        input.reportState,
        input.lifecycleState,
        input.decidedAt,
        input.priorState,
        auditEventId,
        input.actorRole,
        input.actionType,
        input.correlationId,
        input.comment,
        JSON.stringify(input.metadata),
        input.ownerUserId,
      ],
    );

    const row = result.rows[0];
    return row
      ? {
          report: mapReviewableReportRow(row),
          auditEvent: mapSupervisorDecisionAuditEvent(row),
        }
      : null;
  }

  async recordSupervisorEscalation(input: {
    supervisorUserId: string;
    actorRole: AuditEventRecord['actorRole'];
    ownerUserId: string;
    reportId: string;
    managerReviewerUserId: string;
    reportState: 'escalated-pending-manager-review';
    lifecycleState: 'Escalated - Pending Manager Review';
    decidedAt: string;
    correlationId: string;
    actionType: string;
    priorState: string;
    rationale: string;
    metadata: Record<string, unknown>;
  }): Promise<SupervisorDecisionPersistenceResult | null> {
    const auditEventId = randomUUID();
    const result = await this.database.query<SupervisorDecisionRow>(
      `
        WITH updated AS (
          UPDATE report_submission_records
          SET
            report_state = $3,
            lifecycle_state = $4,
            sync_state = 'synced',
            updated_at = $5
          WHERE owner_user_id = $13
            AND report_id = $2
            AND lifecycle_state = $6
          RETURNING
            owner_user_id,
            report_id,
            work_package_id,
            tag_id,
            template_id,
            template_version,
            server_report_version,
            report_state,
            lifecycle_state,
            sync_state,
            submitted_at,
            accepted_at,
            payload_json
        ),
        audit AS (
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
          SELECT
            $7,
            $1,
            $8,
            $9,
            'report',
            updated.report_id,
            $5,
            $10,
            $6,
            $4,
            $11,
            $12::jsonb
          FROM updated
          RETURNING
            id AS audit_id,
            actor_id AS audit_actor_id,
            actor_role AS audit_actor_role,
            action_type AS audit_action_type,
            target_object_type AS audit_target_object_type,
            target_object_id AS audit_target_object_id,
            occurred_at AS audit_occurred_at,
            correlation_id AS audit_correlation_id,
            prior_state AS audit_prior_state,
            next_state AS audit_next_state,
            comment AS audit_comment,
            metadata_json AS audit_metadata_json
        ),
        manager_route AS (
          INSERT INTO manager_review_routes (
            manager_user_id,
            owner_user_id,
            report_id,
            route_state,
            routed_at,
            escalation_audit_event_id
          )
          SELECT
            $14,
            updated.owner_user_id,
            updated.report_id,
            'active',
            $5,
            audit.audit_id
          FROM updated, audit
          ON CONFLICT (manager_user_id, owner_user_id, report_id) DO UPDATE SET
            route_state = 'active',
            routed_at = EXCLUDED.routed_at,
            escalation_audit_event_id = EXCLUDED.escalation_audit_event_id
          RETURNING manager_user_id AS routed_manager_user_id
        )
        SELECT
          updated.owner_user_id,
          updated.report_id,
          updated.work_package_id,
          updated.tag_id,
          updated.template_id,
          updated.template_version,
          updated.server_report_version,
          updated.report_state,
          updated.lifecycle_state,
          updated.sync_state,
          updated.submitted_at,
          updated.accepted_at,
          updated.payload_json,
          audit.audit_id,
          audit.audit_actor_id,
          audit.audit_actor_role,
          audit.audit_action_type,
          audit.audit_target_object_type,
          audit.audit_target_object_id,
          audit.audit_occurred_at,
          audit.audit_correlation_id,
          audit.audit_prior_state,
          audit.audit_next_state,
          audit.audit_comment,
          audit.audit_metadata_json,
          manager_route.routed_manager_user_id
        FROM updated, audit, manager_route;
      `,
      [
        input.supervisorUserId,
        input.reportId,
        input.reportState,
        input.lifecycleState,
        input.decidedAt,
        input.priorState,
        auditEventId,
        input.actorRole,
        input.actionType,
        input.correlationId,
        input.rationale,
        JSON.stringify(input.metadata),
        input.ownerUserId,
        input.managerReviewerUserId,
      ],
    );

    const row = result.rows[0];
    return row
      ? {
          report: mapReviewableReportRow(row),
          auditEvent: mapSupervisorDecisionAuditEvent(row),
          managerReviewerUserId: row.routed_manager_user_id,
        }
      : null;
  }
}

function mapReviewableReportRow(row: ReviewableReportRow): ReviewableReportRecord {
  return {
    ownerUserId: row.owner_user_id,
    reportId: row.report_id,
    workPackageId: row.work_package_id,
    tagId: row.tag_id,
    templateId: row.template_id,
    templateVersion: row.template_version,
    serverReportVersion: row.server_report_version,
    reportState: row.report_state,
    lifecycleState: row.lifecycle_state,
    syncState: row.sync_state,
    submittedAt: row.submitted_at,
    acceptedAt: row.accepted_at,
    payloadJson: row.payload_json,
  };
}

function mapSupervisorDecisionAuditEvent(row: SupervisorDecisionRow): AuditEventRecord {
  return {
    id: row.audit_id,
    actorId: row.audit_actor_id,
    actorRole: row.audit_actor_role,
    actionType: row.audit_action_type,
    targetObjectType: row.audit_target_object_type,
    targetObjectId: row.audit_target_object_id,
    occurredAt: row.audit_occurred_at,
    correlationId: row.audit_correlation_id,
    priorState: row.audit_prior_state,
    nextState: row.audit_next_state,
    comment: row.audit_comment,
    metadataJson:
      typeof row.audit_metadata_json === 'string'
        ? row.audit_metadata_json
        : JSON.stringify(row.audit_metadata_json ?? {}),
  };
}
