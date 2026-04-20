import type { StoredExecutionProgressRecord } from '../../../features/execution/model';
import type { LocalDatabase } from '../sqlite/types';

interface ExecutionProgressRow {
  work_package_id: string;
  tag_id: string;
  template_id: string;
  template_version: string;
  instrument_family: string;
  test_pattern: string;
  current_step_id: string;
  visited_step_ids_json: string;
  updated_at: string;
}

export class UserPartitionedExecutionProgressRepository {
  constructor(
    private readonly database: LocalDatabase,
    private readonly ownerUserId: string,
  ) {}

  async getProgress(
    workPackageId: string,
    tagId: string,
    templateId: string,
  ): Promise<StoredExecutionProgressRecord | null> {
    const row = await this.database.getFirstAsync<ExecutionProgressRow>(
      `
        SELECT
          work_package_id,
          tag_id,
          template_id,
          template_version,
          instrument_family,
          test_pattern,
          current_step_id,
          visited_step_ids_json,
          updated_at
        FROM user_partitioned_execution_progress
        WHERE owner_user_id = ?
          AND work_package_id = ?
          AND tag_id = ?
          AND template_id = ?;
      `,
      [this.ownerUserId, workPackageId, tagId, templateId],
    );

    return row ? mapExecutionProgressRow(row) : null;
  }

  async saveProgress(record: StoredExecutionProgressRecord): Promise<void> {
    await this.database.runAsync(
      `
        INSERT INTO user_partitioned_execution_progress (
          owner_user_id,
          work_package_id,
          tag_id,
          template_id,
          template_version,
          instrument_family,
          test_pattern,
          current_step_id,
          visited_step_ids_json,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_user_id, work_package_id, tag_id, template_id) DO UPDATE SET
          template_version = excluded.template_version,
          instrument_family = excluded.instrument_family,
          test_pattern = excluded.test_pattern,
          current_step_id = excluded.current_step_id,
          visited_step_ids_json = excluded.visited_step_ids_json,
          updated_at = excluded.updated_at;
      `,
      [
        this.ownerUserId,
        record.workPackageId,
        record.tagId,
        record.templateId,
        record.templateVersion,
        record.instrumentFamily,
        record.testPattern,
        record.currentStepId,
        JSON.stringify(record.visitedStepIds),
        record.updatedAt,
      ],
    );
  }
}

function mapExecutionProgressRow(row: ExecutionProgressRow): StoredExecutionProgressRecord {
  return {
    workPackageId: row.work_package_id,
    tagId: row.tag_id,
    templateId: row.template_id,
    templateVersion: row.template_version,
    instrumentFamily: row.instrument_family,
    testPattern: row.test_pattern,
    currentStepId: row.current_step_id,
    visitedStepIds: JSON.parse(row.visited_step_ids_json) as string[],
    updatedAt: row.updated_at,
  };
}
