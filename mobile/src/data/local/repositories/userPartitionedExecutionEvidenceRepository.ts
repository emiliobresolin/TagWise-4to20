import type { StoredExecutionEvidenceRecord } from '../../../features/execution/model';
import type { LocalDatabase } from '../sqlite/types';

interface ExecutionEvidenceRow {
  work_package_id: string;
  tag_id: string;
  template_id: string;
  template_version: string;
  draft_report_id: string;
  execution_step_id: string;
  structured_readings_json: string;
  observation_notes_text: string;
  checklist_outcomes_json: string;
  created_at: string;
  updated_at: string;
}

export class UserPartitionedExecutionEvidenceRepository {
  constructor(
    private readonly database: LocalDatabase,
    private readonly ownerUserId: string,
  ) {}

  async getEvidenceForStep(
    workPackageId: string,
    tagId: string,
    templateId: string,
    templateVersion: string,
    executionStepId: StoredExecutionEvidenceRecord['executionStepId'],
  ): Promise<StoredExecutionEvidenceRecord | null> {
    const row = await this.database.getFirstAsync<ExecutionEvidenceRow>(
      `
        SELECT
          work_package_id,
          tag_id,
          template_id,
          template_version,
          draft_report_id,
          execution_step_id,
          structured_readings_json,
          observation_notes_text,
          checklist_outcomes_json,
          created_at,
          updated_at
        FROM user_partitioned_execution_evidence
        WHERE owner_user_id = ?
          AND work_package_id = ?
          AND tag_id = ?
          AND template_id = ?
          AND template_version = ?
          AND execution_step_id = ?;
      `,
      [
        this.ownerUserId,
        workPackageId,
        tagId,
        templateId,
        templateVersion,
        executionStepId,
      ],
    );

    return row ? mapExecutionEvidenceRow(row) : null;
  }

  async listEvidence(
    workPackageId: string,
    tagId: string,
    templateId: string,
    templateVersion: string,
  ): Promise<StoredExecutionEvidenceRecord[]> {
    const rows = await this.database.getAllAsync<ExecutionEvidenceRow>(
      `
        SELECT
          work_package_id,
          tag_id,
          template_id,
          template_version,
          draft_report_id,
          execution_step_id,
          structured_readings_json,
          observation_notes_text,
          checklist_outcomes_json,
          created_at,
          updated_at
        FROM user_partitioned_execution_evidence
        WHERE owner_user_id = ?
          AND work_package_id = ?
          AND tag_id = ?
          AND template_id = ?
          AND template_version = ?
        ORDER BY updated_at ASC, execution_step_id ASC;
      `,
      [this.ownerUserId, workPackageId, tagId, templateId, templateVersion],
    );

    return rows.map(mapExecutionEvidenceRow);
  }

  async saveEvidence(record: StoredExecutionEvidenceRecord): Promise<void> {
    await this.database.runAsync(
      `
        INSERT INTO user_partitioned_execution_evidence (
          owner_user_id,
          work_package_id,
          tag_id,
          template_id,
          template_version,
          draft_report_id,
          execution_step_id,
          structured_readings_json,
          observation_notes_text,
          checklist_outcomes_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(
          owner_user_id,
          work_package_id,
          tag_id,
          template_id,
          template_version,
          execution_step_id
        ) DO UPDATE SET
          draft_report_id = excluded.draft_report_id,
          structured_readings_json = excluded.structured_readings_json,
          observation_notes_text = excluded.observation_notes_text,
          checklist_outcomes_json = excluded.checklist_outcomes_json,
          updated_at = excluded.updated_at;
      `,
      [
        this.ownerUserId,
        record.workPackageId,
        record.tagId,
        record.templateId,
        record.templateVersion,
        record.draftReportId,
        record.executionStepId,
        JSON.stringify(record.structuredReadings),
        record.observationNotes,
        JSON.stringify(record.checklistOutcomes),
        record.createdAt,
        record.updatedAt,
      ],
    );
  }
}

function mapExecutionEvidenceRow(
  row: ExecutionEvidenceRow,
): StoredExecutionEvidenceRecord {
  return {
    workPackageId: row.work_package_id,
    tagId: row.tag_id,
    templateId: row.template_id,
    templateVersion: row.template_version,
    draftReportId: row.draft_report_id,
    executionStepId: row.execution_step_id as StoredExecutionEvidenceRecord['executionStepId'],
    structuredReadings:
      (JSON.parse(row.structured_readings_json) as StoredExecutionEvidenceRecord['structuredReadings']) ??
      null,
    observationNotes: row.observation_notes_text,
    checklistOutcomes:
      (JSON.parse(
        row.checklist_outcomes_json,
      ) as StoredExecutionEvidenceRecord['checklistOutcomes']) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
