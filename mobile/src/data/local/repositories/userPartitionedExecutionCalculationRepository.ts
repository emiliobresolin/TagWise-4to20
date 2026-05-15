import type { StoredExecutionCalculationRecord } from '../../../features/execution/model';
import type { LocalDatabase } from '../sqlite/types';

interface ExecutionCalculationRow {
  work_package_id: string;
  tag_id: string;
  template_id: string;
  template_version: string;
  calculation_mode: string;
  acceptance_style: string;
  execution_context_json: string;
  raw_inputs_json: string;
  result_json: string;
  updated_at: string;
}

export class UserPartitionedExecutionCalculationRepository {
  constructor(
    private readonly database: LocalDatabase,
    private readonly ownerUserId: string,
  ) {}

  async listForTag(
    workPackageId: string,
    tagId: string,
  ): Promise<StoredExecutionCalculationRecord[]> {
    // Story 8.11: enumerate every persisted calculation for a tag so the
    // detail screen can render per-template status badges (Concluido /
    // Falha / Iniciar) without loading each shell individually.
    const rows = await this.database.getAllAsync<ExecutionCalculationRow>(
      `
        SELECT
          work_package_id,
          tag_id,
          template_id,
          template_version,
          calculation_mode,
          acceptance_style,
          execution_context_json,
          raw_inputs_json,
          result_json,
          updated_at
        FROM user_partitioned_execution_calculations
        WHERE owner_user_id = ?
          AND work_package_id = ?
          AND tag_id = ?;
      `,
      [this.ownerUserId, workPackageId, tagId],
    );

    return rows.map(mapExecutionCalculationRow);
  }

  async getCalculation(
    workPackageId: string,
    tagId: string,
    templateId: string,
    templateVersion: string,
  ): Promise<StoredExecutionCalculationRecord | null> {
    const row = await this.database.getFirstAsync<ExecutionCalculationRow>(
      `
        SELECT
          work_package_id,
          tag_id,
          template_id,
          template_version,
          calculation_mode,
          acceptance_style,
          execution_context_json,
          raw_inputs_json,
          result_json,
          updated_at
        FROM user_partitioned_execution_calculations
        WHERE owner_user_id = ?
          AND work_package_id = ?
          AND tag_id = ?
          AND template_id = ?
          AND template_version = ?;
      `,
      [this.ownerUserId, workPackageId, tagId, templateId, templateVersion],
    );

    return row ? mapExecutionCalculationRow(row) : null;
  }

  async deleteForWorkPackage(workPackageId: string): Promise<void> {
    // Story 8.13: drop every saved calculation row for this work
    // package so the detail screen badges and the visit aggregator
    // start fresh after re-download.
    await this.database.runAsync(
      `
        DELETE FROM user_partitioned_execution_calculations
        WHERE owner_user_id = ?
          AND work_package_id = ?;
      `,
      [this.ownerUserId, workPackageId],
    );
  }

  async saveCalculation(record: StoredExecutionCalculationRecord): Promise<void> {
    await this.database.runAsync(
      `
        INSERT INTO user_partitioned_execution_calculations (
          owner_user_id,
          work_package_id,
          tag_id,
          template_id,
          template_version,
          calculation_mode,
          acceptance_style,
          execution_context_json,
          raw_inputs_json,
          result_json,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_user_id, work_package_id, tag_id, template_id, template_version) DO UPDATE SET
          calculation_mode = excluded.calculation_mode,
          acceptance_style = excluded.acceptance_style,
          execution_context_json = excluded.execution_context_json,
          raw_inputs_json = excluded.raw_inputs_json,
          result_json = excluded.result_json,
          updated_at = excluded.updated_at;
      `,
      [
        this.ownerUserId,
        record.workPackageId,
        record.tagId,
        record.templateId,
        record.templateVersion,
        record.calculationMode,
        record.acceptanceStyle,
        JSON.stringify(record.executionContext),
        JSON.stringify(record.rawInputs),
        JSON.stringify(record.result),
        record.updatedAt,
      ],
    );
  }
}

function mapExecutionCalculationRow(
  row: ExecutionCalculationRow,
): StoredExecutionCalculationRecord {
  const executionContext = JSON.parse(row.execution_context_json) as
    | StoredExecutionCalculationRecord['executionContext']
    | undefined;

  return {
    workPackageId: row.work_package_id,
    tagId: row.tag_id,
    templateId: row.template_id,
    templateVersion: row.template_version,
    calculationMode: row.calculation_mode,
    acceptanceStyle: row.acceptance_style,
    executionContext: {
      conversionBasisSummary: executionContext?.conversionBasisSummary ?? null,
      expectedRangeSummary: executionContext?.expectedRangeSummary ?? null,
    },
    rawInputs: JSON.parse(row.raw_inputs_json),
    result: JSON.parse(row.result_json),
    updatedAt: row.updated_at,
  };
}
