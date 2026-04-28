import type { QueryResultRow } from 'pg';

import type { QueryableDatabase } from '../../platform/db/postgres';
import type {
  AssignedWorkPackageSnapshot,
  AssignedWorkPackageStatus,
  AssignedWorkPackageSummary,
  SeededAssignedWorkPackageRecord,
} from './model';

interface AssignedWorkPackageSummaryRow extends QueryResultRow {
  id: string;
  source_reference: string;
  title: string;
  assigned_team: string;
  priority: AssignedWorkPackageSummary['priority'];
  status: AssignedWorkPackageSummary['status'];
  package_version: number;
  snapshot_contract_version: string;
  tag_count: number;
  due_starts_at: string | null;
  due_ends_at: string | null;
  updated_at: string;
}

interface AssignedWorkPackageSnapshotRow extends QueryResultRow {
  snapshot_json: AssignedWorkPackageSnapshot;
}

interface ReportLifecycleRow extends QueryResultRow {
  tag_id: string;
  lifecycle_state: string;
}

export class AssignedWorkPackageRepository {
  constructor(private readonly database: QueryableDatabase) {}

  async upsertSeedPackage(record: SeededAssignedWorkPackageRecord): Promise<void> {
    await this.database.query(
      `
        INSERT INTO assigned_work_packages (
          id,
          source_reference,
          assigned_user_id,
          title,
          assigned_team,
          priority,
          status,
          package_version,
          snapshot_contract_version,
          tag_count,
          due_starts_at,
          due_ends_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          source_reference = EXCLUDED.source_reference,
          assigned_user_id = EXCLUDED.assigned_user_id,
          title = EXCLUDED.title,
          assigned_team = EXCLUDED.assigned_team,
          priority = EXCLUDED.priority,
          status = EXCLUDED.status,
          package_version = EXCLUDED.package_version,
          snapshot_contract_version = EXCLUDED.snapshot_contract_version,
          tag_count = EXCLUDED.tag_count,
          due_starts_at = EXCLUDED.due_starts_at,
          due_ends_at = EXCLUDED.due_ends_at,
          updated_at = EXCLUDED.updated_at;
      `,
      [
        record.summary.id,
        record.summary.sourceReference,
        record.assignedUserId,
        record.summary.title,
        record.summary.assignedTeam,
        record.summary.priority,
        record.summary.status,
        record.summary.packageVersion,
        record.summary.snapshotContractVersion,
        record.summary.tagCount,
        record.summary.dueWindow.startsAt,
        record.summary.dueWindow.endsAt,
        record.summary.updatedAt,
      ],
    );

    await this.database.query(
      `
        INSERT INTO assigned_work_package_snapshots (
          work_package_id,
          snapshot_contract_version,
          snapshot_json,
          updated_at
        )
        VALUES ($1, $2, $3::jsonb, $4)
        ON CONFLICT (work_package_id) DO UPDATE SET
          snapshot_contract_version = EXCLUDED.snapshot_contract_version,
          snapshot_json = EXCLUDED.snapshot_json,
          updated_at = EXCLUDED.updated_at;
      `,
      [
        record.summary.id,
        record.snapshot.contractVersion,
        JSON.stringify(record.snapshot),
        record.summary.updatedAt,
      ],
    );
  }

  async listAssignedSummariesForUser(userId: string): Promise<AssignedWorkPackageSummary[]> {
    const result = await this.database.query<AssignedWorkPackageSummaryRow>(
      `
        SELECT
          id,
          source_reference,
          title,
          assigned_team,
          priority,
          status,
          package_version,
          snapshot_contract_version,
          tag_count,
          due_starts_at,
          due_ends_at,
          updated_at
        FROM assigned_work_packages
        WHERE assigned_user_id = $1
        ORDER BY
          CASE priority
            WHEN 'high' THEN 0
            ELSE 1
          END ASC,
          due_ends_at ASC NULLS LAST,
          id ASC;
      `,
      [userId],
    );

    return Promise.all(
      result.rows.map(async (row) => {
        const summary = mapAssignedWorkPackageSummaryRow(row);
        return this.withDerivedRollupStatus(userId, summary);
      }),
    );
  }

  async getAssignedSnapshotForUser(
    userId: string,
    workPackageId: string,
  ): Promise<AssignedWorkPackageSnapshot | null> {
    const result = await this.database.query<AssignedWorkPackageSnapshotRow>(
      `
        SELECT snapshot_json
        FROM assigned_work_package_snapshots snapshot
        INNER JOIN assigned_work_packages work_package
          ON work_package.id = snapshot.work_package_id
        WHERE work_package.assigned_user_id = $1
          AND work_package.id = $2
        LIMIT 1;
      `,
      [userId, workPackageId],
    );

    const raw = result.rows[0]?.snapshot_json;
    if (!raw) {
      return null;
    }

    const snapshot = typeof raw === 'string'
      ? (JSON.parse(raw) as AssignedWorkPackageSnapshot)
      : (raw as AssignedWorkPackageSnapshot);

    return {
      ...snapshot,
      summary: await this.withDerivedRollupStatus(userId, snapshot.summary),
    };
  }

  private async withDerivedRollupStatus(
    ownerUserId: string,
    summary: AssignedWorkPackageSummary,
  ): Promise<AssignedWorkPackageSummary> {
    const status = await this.deriveRollupStatus(ownerUserId, summary.id, summary.tagCount);
    return status === summary.status ? summary : { ...summary, status };
  }

  private async deriveRollupStatus(
    ownerUserId: string,
    workPackageId: string,
    expectedTagCount: number,
  ): Promise<AssignedWorkPackageStatus> {
    const result = await this.database.query<ReportLifecycleRow>(
      `
        SELECT tag_id, lifecycle_state
        FROM report_submission_records
        WHERE owner_user_id = $1
          AND work_package_id = $2;
      `,
      [ownerUserId, workPackageId],
    );
    const rows = result.rows;
    if (rows.length === 0) {
      return 'assigned';
    }

    if (
      rows.some(
        (row) =>
          row.lifecycle_state === 'Returned by Supervisor' ||
          row.lifecycle_state === 'Returned by Manager',
      )
    ) {
      return 'attention_needed';
    }

    const approvedTags = new Set(
      rows
        .filter((row) => row.lifecycle_state === 'Approved')
        .map((row) => row.tag_id),
    );
    if (expectedTagCount > 0 && approvedTags.size >= expectedTagCount) {
      return 'completed';
    }

    const submittedTags = new Set(rows.map((row) => row.tag_id));
    const hasReviewableReport = rows.some(
      (row) =>
        row.lifecycle_state === 'Submitted - Pending Supervisor Review' ||
        row.lifecycle_state === 'Escalated - Pending Manager Review',
    );
    if (expectedTagCount > 0 && submittedTags.size >= expectedTagCount && hasReviewableReport) {
      return 'pending_review';
    }

    return 'in_progress';
  }
}

function mapAssignedWorkPackageSummaryRow(
  row: AssignedWorkPackageSummaryRow,
): AssignedWorkPackageSummary {
  return {
    id: row.id,
    sourceReference: row.source_reference,
    title: row.title,
    assignedTeam: row.assigned_team,
    priority: row.priority,
    status: row.status,
    packageVersion: row.package_version,
    snapshotContractVersion: row.snapshot_contract_version,
    tagCount: row.tag_count,
    dueWindow: {
      startsAt: row.due_starts_at,
      endsAt: row.due_ends_at,
    },
    updatedAt: row.updated_at,
  };
}
