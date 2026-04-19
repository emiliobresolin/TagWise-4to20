import type {
  AssignedWorkPackageSnapshot,
  AssignedWorkPackageSummary,
  LocalAssignedWorkPackageSummary,
} from '../../../features/work-packages/model';
import type { LocalDatabase } from '../sqlite/types';

interface AssignedWorkPackageSummaryRow {
  work_package_id: string;
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
  last_downloaded_at: string | null;
  has_snapshot: number;
}

interface AssignedWorkPackageSnapshotRow {
  snapshot_json: string;
}

export class AssignedWorkPackageRepository {
  constructor(
    private readonly database: LocalDatabase,
    private readonly ownerUserId: string,
  ) {}

  async upsertCatalog(summaries: AssignedWorkPackageSummary[]): Promise<void> {
    for (const summary of summaries) {
      await this.database.runAsync(
        `
          INSERT INTO assigned_work_package_summaries (
            owner_user_id,
            work_package_id,
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
            updated_at,
            last_downloaded_at,
            local_updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(owner_user_id, work_package_id) DO UPDATE SET
            source_reference = excluded.source_reference,
            title = excluded.title,
            assigned_team = excluded.assigned_team,
            priority = excluded.priority,
            status = excluded.status,
            package_version = excluded.package_version,
            snapshot_contract_version = excluded.snapshot_contract_version,
            tag_count = excluded.tag_count,
            due_starts_at = excluded.due_starts_at,
            due_ends_at = excluded.due_ends_at,
            updated_at = excluded.updated_at,
            last_downloaded_at = COALESCE(
              excluded.last_downloaded_at,
              assigned_work_package_summaries.last_downloaded_at
            ),
            local_updated_at = excluded.local_updated_at;
        `,
        [
          this.ownerUserId,
          summary.id,
          summary.sourceReference,
          summary.title,
          summary.assignedTeam,
          summary.priority,
          summary.status,
          summary.packageVersion,
          summary.snapshotContractVersion,
          summary.tagCount,
          summary.dueWindow.startsAt,
          summary.dueWindow.endsAt,
          summary.updatedAt,
          null,
          new Date().toISOString(),
        ],
      );
    }
  }

  async saveDownloadedSnapshot(
    snapshot: AssignedWorkPackageSnapshot,
    downloadedAt: string,
  ): Promise<void> {
    await this.database.runAsync(
      `
        INSERT INTO assigned_work_package_summaries (
          owner_user_id,
          work_package_id,
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
          updated_at,
          last_downloaded_at,
          local_updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_user_id, work_package_id) DO UPDATE SET
          source_reference = excluded.source_reference,
          title = excluded.title,
          assigned_team = excluded.assigned_team,
          priority = excluded.priority,
          status = excluded.status,
          package_version = excluded.package_version,
          snapshot_contract_version = excluded.snapshot_contract_version,
          tag_count = excluded.tag_count,
          due_starts_at = excluded.due_starts_at,
          due_ends_at = excluded.due_ends_at,
          updated_at = excluded.updated_at,
          last_downloaded_at = excluded.last_downloaded_at,
          local_updated_at = excluded.local_updated_at;
      `,
      [
        this.ownerUserId,
        snapshot.summary.id,
        snapshot.summary.sourceReference,
        snapshot.summary.title,
        snapshot.summary.assignedTeam,
        snapshot.summary.priority,
        snapshot.summary.status,
        snapshot.summary.packageVersion,
        snapshot.summary.snapshotContractVersion,
        snapshot.summary.tagCount,
        snapshot.summary.dueWindow.startsAt,
        snapshot.summary.dueWindow.endsAt,
        snapshot.summary.updatedAt,
        downloadedAt,
        downloadedAt,
      ],
    );

    await this.database.runAsync(
      `
        INSERT INTO assigned_work_package_snapshots (
          owner_user_id,
          work_package_id,
          package_version,
          snapshot_contract_version,
          snapshot_json,
          downloaded_at,
          server_updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_user_id, work_package_id) DO UPDATE SET
          package_version = excluded.package_version,
          snapshot_contract_version = excluded.snapshot_contract_version,
          snapshot_json = excluded.snapshot_json,
          downloaded_at = excluded.downloaded_at,
          server_updated_at = excluded.server_updated_at;
      `,
      [
        this.ownerUserId,
        snapshot.summary.id,
        snapshot.summary.packageVersion,
        snapshot.contractVersion,
        JSON.stringify(snapshot),
        downloadedAt,
        snapshot.summary.updatedAt,
      ],
    );
  }

  async listSummaries(): Promise<LocalAssignedWorkPackageSummary[]> {
    const rows = await this.database.getAllAsync<AssignedWorkPackageSummaryRow>(
      `
        SELECT
          summary.work_package_id,
          summary.source_reference,
          summary.title,
          summary.assigned_team,
          summary.priority,
          summary.status,
          summary.package_version,
          summary.snapshot_contract_version,
          summary.tag_count,
          summary.due_starts_at,
          summary.due_ends_at,
          summary.updated_at,
          summary.last_downloaded_at,
          CASE WHEN snapshot.work_package_id IS NULL THEN 0 ELSE 1 END as has_snapshot
        FROM assigned_work_package_summaries summary
        LEFT JOIN assigned_work_package_snapshots snapshot
          ON snapshot.owner_user_id = summary.owner_user_id
         AND snapshot.work_package_id = summary.work_package_id
        WHERE summary.owner_user_id = ?
        ORDER BY
          CASE summary.priority
            WHEN 'high' THEN 0
            ELSE 1
          END ASC,
          summary.due_ends_at ASC,
          summary.work_package_id ASC;
      `,
      [this.ownerUserId],
    );

    return rows.map(mapAssignedWorkPackageSummaryRow);
  }

  async getSnapshot(workPackageId: string): Promise<AssignedWorkPackageSnapshot | null> {
    const row = await this.database.getFirstAsync<AssignedWorkPackageSnapshotRow>(
      `
        SELECT snapshot_json
        FROM assigned_work_package_snapshots
        WHERE owner_user_id = ?
          AND work_package_id = ?;
      `,
      [this.ownerUserId, workPackageId],
    );

    return row ? (JSON.parse(row.snapshot_json) as AssignedWorkPackageSnapshot) : null;
  }
}

function mapAssignedWorkPackageSummaryRow(
  row: AssignedWorkPackageSummaryRow,
): LocalAssignedWorkPackageSummary {
  return {
    id: row.work_package_id,
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
    downloadedAt: row.last_downloaded_at,
    hasSnapshot: row.has_snapshot === 1,
  };
}
