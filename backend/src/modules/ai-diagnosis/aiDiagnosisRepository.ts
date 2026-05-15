import type { QueryResultRow } from 'pg';

import type { QueryableDatabase } from '../../platform/db/postgres';
import type {
  AiDiagnosisRecord,
  AiDiagnosisRecordState,
  AiDiagnosisRequestSource,
  AiDiagnosisResult,
} from './model';

interface AiDiagnosisRow extends QueryResultRow {
  owner_user_id: string;
  report_id: string;
  state: AiDiagnosisRecordState;
  result_json: unknown;
  provider_label: string | null;
  summary: string | null;
  detail: string | null;
  failure_reason: string | null;
  last_requested_at: string;
  last_request_source: AiDiagnosisRequestSource;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertPendingDiagnosisInput {
  ownerUserId: string;
  reportId: string;
  requestSource: AiDiagnosisRequestSource;
  requestedAt: string;
}

export interface MarkAvailableInput {
  ownerUserId: string;
  reportId: string;
  result: AiDiagnosisResult;
  providerLabel: string;
  summary: string;
  detail: string;
  generatedAt: string;
  updatedAt: string;
}

export interface MarkFailedInput {
  ownerUserId: string;
  reportId: string;
  failureReason: string;
  updatedAt: string;
}

export class AiDiagnosisRepository {
  constructor(private readonly database: QueryableDatabase) {}

  async getByReportId(
    ownerUserId: string,
    reportId: string,
  ): Promise<AiDiagnosisRecord | null> {
    const result = await this.database.query<AiDiagnosisRow>(
      `
        SELECT ${aiDiagnosisColumns}
        FROM ai_diagnoses
        WHERE owner_user_id = $1
          AND report_id = $2
        LIMIT 1;
      `,
      [ownerUserId, reportId],
    );

    const row = result.rows[0];
    return row ? mapAiDiagnosisRow(row) : null;
  }

  async upsertPending(input: UpsertPendingDiagnosisInput): Promise<AiDiagnosisRecord> {
    // Story 8.9 D-01: re-requesting AI for a report that already has an
    // 'available' row is a no-op at the persistence layer — the existing row
    // stays. Re-requesting for a 'failed-nonblocking' row resets to 'pending'
    // so the worker tries again.
    const result = await this.database.query<AiDiagnosisRow>(
      `
        INSERT INTO ai_diagnoses (
          owner_user_id,
          report_id,
          state,
          result_json,
          provider_label,
          summary,
          detail,
          failure_reason,
          last_requested_at,
          last_request_source,
          generated_at,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2,
          'pending',
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          $3,
          $4,
          NULL,
          $3,
          $3
        )
        ON CONFLICT (owner_user_id, report_id) DO UPDATE
        SET state = CASE
              WHEN ai_diagnoses.state = 'available' THEN ai_diagnoses.state
              ELSE 'pending'
            END,
            failure_reason = CASE
              WHEN ai_diagnoses.state = 'available' THEN ai_diagnoses.failure_reason
              ELSE NULL
            END,
            last_requested_at = $3,
            last_request_source = $4,
            updated_at = $3
        RETURNING ${aiDiagnosisColumns};
      `,
      [input.ownerUserId, input.reportId, input.requestedAt, input.requestSource],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to upsert AI diagnosis pending row.');
    }

    return mapAiDiagnosisRow(row);
  }

  async markAvailable(input: MarkAvailableInput): Promise<void> {
    await this.database.query(
      `
        UPDATE ai_diagnoses
        SET state = 'available',
            result_json = $3,
            provider_label = $4,
            summary = $5,
            detail = $6,
            failure_reason = NULL,
            generated_at = $7,
            updated_at = $8
        WHERE owner_user_id = $1
          AND report_id = $2;
      `,
      [
        input.ownerUserId,
        input.reportId,
        JSON.stringify(input.result),
        input.providerLabel,
        input.summary,
        input.detail,
        input.generatedAt,
        input.updatedAt,
      ],
    );
  }

  async markFailedNonblocking(input: MarkFailedInput): Promise<void> {
    await this.database.query(
      `
        UPDATE ai_diagnoses
        SET state = 'failed-nonblocking',
            failure_reason = $3,
            updated_at = $4
        WHERE owner_user_id = $1
          AND report_id = $2;
      `,
      [input.ownerUserId, input.reportId, input.failureReason, input.updatedAt],
    );
  }
}

const aiDiagnosisColumns = `
  owner_user_id,
  report_id,
  state,
  result_json,
  provider_label,
  summary,
  detail,
  failure_reason,
  last_requested_at,
  last_request_source,
  generated_at,
  created_at,
  updated_at
`;

function mapAiDiagnosisRow(row: AiDiagnosisRow): AiDiagnosisRecord {
  return {
    ownerUserId: row.owner_user_id,
    reportId: row.report_id,
    state: row.state,
    result: parseResult(row.result_json),
    providerLabel: row.provider_label,
    summary: row.summary,
    detail: row.detail,
    failureReason: row.failure_reason,
    lastRequestedAt: row.last_requested_at,
    lastRequestSource: row.last_request_source,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseResult(value: unknown): AiDiagnosisResult | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isAiDiagnosisResult(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isAiDiagnosisResult(value) ? value : null;
}

function isAiDiagnosisResult(value: unknown): value is AiDiagnosisResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AiDiagnosisResult).summary === 'string' &&
    typeof (value as AiDiagnosisResult).provider === 'string'
  );
}
