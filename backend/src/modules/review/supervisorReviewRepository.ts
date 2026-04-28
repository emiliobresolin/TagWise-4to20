import type { QueryResultRow } from 'pg';

import type { QueryableDatabase } from '../../platform/db/postgres';
import type { ReviewableReportRecord } from './model';

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
