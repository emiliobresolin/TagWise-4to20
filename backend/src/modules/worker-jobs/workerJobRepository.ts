import { randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';

import type { QueryableDatabase } from '../../platform/db/postgres';
import type {
  EnqueueWorkerJobInput,
  WorkerJobRecord,
  WorkerJobStatus,
} from './model';

interface WorkerJobRow extends QueryResultRow {
  id: string;
  job_type: string;
  idempotency_key: string;
  status: WorkerJobStatus;
  payload_json: unknown;
  attempt_count: number;
  max_attempts: number;
  available_at: string;
  locked_by: string | null;
  locked_at: string | null;
  last_error: string | null;
  last_started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export class WorkerJobRepository {
  constructor(private readonly database: QueryableDatabase) {}

  async enqueue(input: EnqueueWorkerJobInput): Promise<WorkerJobRecord> {
    const existing = await this.getByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return existing;
    }

    const id = input.id ?? `worker-job:${randomUUID()}`;
    await this.database.query(
      `
        INSERT INTO worker_jobs (
          id,
          job_type,
          idempotency_key,
          status,
          payload_json,
          attempt_count,
          max_attempts,
          available_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, 'queued', $4, 0, $5, $6, $7, $7);
      `,
      [
        id,
        input.jobType,
        input.idempotencyKey,
        JSON.stringify(input.payloadJson),
        input.maxAttempts,
        input.availableAt,
        input.createdAt,
      ],
    );

    const queued = await this.getById(id);
    if (!queued) {
      throw new Error('Failed to reload worker job after enqueue.');
    }

    return queued;
  }

  async getById(id: string): Promise<WorkerJobRecord | null> {
    const result = await this.database.query<WorkerJobRow>(
      `
        SELECT ${workerJobColumns}
        FROM worker_jobs
        WHERE id = $1
        LIMIT 1;
      `,
      [id],
    );

    return mapWorkerJobRowOrNull(result.rows[0]);
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<WorkerJobRecord | null> {
    const result = await this.database.query<WorkerJobRow>(
      `
        SELECT ${workerJobColumns}
        FROM worker_jobs
        WHERE idempotency_key = $1
        LIMIT 1;
      `,
      [idempotencyKey],
    );

    return mapWorkerJobRowOrNull(result.rows[0]);
  }

  async claimNextReadyJob(
    workerId: string,
    lockedAt: string,
  ): Promise<WorkerJobRecord | null> {
    const ready = await this.database.query<{ id: string }>(
      `
        SELECT id
        FROM worker_jobs
        WHERE status IN ('queued', 'retryable')
          AND available_at <= $1
        ORDER BY available_at ASC, created_at ASC, id ASC
        LIMIT 1;
      `,
      [lockedAt],
    );
    const id = ready.rows[0]?.id;
    return id ? this.claimReadyJobById(id, workerId, lockedAt) : null;
  }

  async claimReadyJobById(
    id: string,
    workerId: string,
    lockedAt: string,
  ): Promise<WorkerJobRecord | null> {
    const result = await this.database.query<WorkerJobRow>(
      `
        UPDATE worker_jobs
        SET status = 'running',
            attempt_count = attempt_count + 1,
            locked_by = $2,
            locked_at = $3,
            last_started_at = $3,
            updated_at = $3
        WHERE id = $1
          AND status IN ('queued', 'retryable')
          AND available_at <= $3
        RETURNING ${workerJobColumns};
      `,
      [id, workerId, lockedAt],
    );

    return mapWorkerJobRowOrNull(result.rows[0]);
  }

  async resetStaleRunningJobs(input: {
    cutoff: string;
    resumedAt: string;
    message: string;
  }): Promise<WorkerJobRecord[]> {
    const result = await this.database.query<WorkerJobRow>(
      `
        UPDATE worker_jobs
        SET status = CASE
              WHEN attempt_count >= max_attempts THEN 'failed'
              ELSE 'retryable'
            END,
            locked_by = NULL,
            locked_at = NULL,
            available_at = $2,
            last_error = COALESCE(last_error, $3),
            updated_at = $2
        WHERE status = 'running'
          AND locked_at <= $1
        RETURNING ${workerJobColumns};
      `,
      [input.cutoff, input.resumedAt, input.message],
    );

    return result.rows.map(mapWorkerJobRow);
  }

  async markSucceeded(id: string, completedAt: string): Promise<WorkerJobRecord> {
    const result = await this.database.query<WorkerJobRow>(
      `
        UPDATE worker_jobs
        SET status = 'succeeded',
            locked_by = NULL,
            locked_at = NULL,
            completed_at = $2,
            updated_at = $2
        WHERE id = $1
        RETURNING ${workerJobColumns};
      `,
      [id, completedAt],
    );

    return mapRequiredWorkerJobRow(result.rows[0], 'succeeded');
  }

  async markRetryable(input: {
    id: string;
    lastError: string;
    availableAt: string;
    updatedAt: string;
  }): Promise<WorkerJobRecord> {
    const result = await this.database.query<WorkerJobRow>(
      `
        UPDATE worker_jobs
        SET status = 'retryable',
            locked_by = NULL,
            locked_at = NULL,
            last_error = $2,
            available_at = $3,
            updated_at = $4
        WHERE id = $1
        RETURNING ${workerJobColumns};
      `,
      [input.id, input.lastError, input.availableAt, input.updatedAt],
    );

    return mapRequiredWorkerJobRow(result.rows[0], 'retryable');
  }

  async markFailed(input: {
    id: string;
    lastError: string;
    updatedAt: string;
  }): Promise<WorkerJobRecord> {
    const result = await this.database.query<WorkerJobRow>(
      `
        UPDATE worker_jobs
        SET status = 'failed',
            locked_by = NULL,
            locked_at = NULL,
            last_error = $2,
            updated_at = $3
        WHERE id = $1
        RETURNING ${workerJobColumns};
      `,
      [input.id, input.lastError, input.updatedAt],
    );

    return mapRequiredWorkerJobRow(result.rows[0], 'failed');
  }

  async listFailedJobs(): Promise<WorkerJobRecord[]> {
    const result = await this.database.query<WorkerJobRow>(
      `
        SELECT ${workerJobColumns}
        FROM worker_jobs
        WHERE status = 'failed'
        ORDER BY updated_at DESC, id ASC;
      `,
    );

    return result.rows.map(mapWorkerJobRow);
  }

  async countJobsByStatus(): Promise<Record<WorkerJobStatus, number>> {
    const result = await this.database.query<{ status: WorkerJobStatus; count: string }>(
      `
        SELECT status, COUNT(*) AS count
        FROM worker_jobs
        GROUP BY status;
      `,
    );
    const counts: Record<WorkerJobStatus, number> = {
      queued: 0,
      running: 0,
      retryable: 0,
      succeeded: 0,
      failed: 0,
    };

    for (const row of result.rows) {
      counts[row.status] = Number(row.count);
    }

    return counts;
  }

  async recordDrillSideEffect(input: {
    jobId: string;
    idempotencyKey: string;
    processedAt: string;
  }): Promise<void> {
    await this.database.query(
      `
        INSERT INTO worker_job_drill_events (
          id,
          job_id,
          idempotency_key,
          processed_at
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (idempotency_key) DO NOTHING;
      `,
      [
        `worker-drill-event:${randomUUID()}`,
        input.jobId,
        input.idempotencyKey,
        input.processedAt,
      ],
    );
  }

  async countDrillSideEffects(jobId: string): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      `
        SELECT COUNT(*) AS count
        FROM worker_job_drill_events
        WHERE job_id = $1;
      `,
      [jobId],
    );

    return Number(result.rows[0]?.count ?? 0);
  }
}

const workerJobColumns = `
  id,
  job_type,
  idempotency_key,
  status,
  payload_json,
  attempt_count,
  max_attempts,
  available_at,
  locked_by,
  locked_at,
  last_error,
  last_started_at,
  completed_at,
  created_at,
  updated_at
`;

function mapWorkerJobRowOrNull(row: WorkerJobRow | undefined): WorkerJobRecord | null {
  return row ? mapWorkerJobRow(row) : null;
}

function mapRequiredWorkerJobRow(
  row: WorkerJobRow | undefined,
  action: string,
): WorkerJobRecord {
  if (!row) {
    throw new Error(`Failed to reload worker job after ${action}.`);
  }

  return mapWorkerJobRow(row);
}

function mapWorkerJobRow(row: WorkerJobRow): WorkerJobRecord {
  return {
    id: row.id,
    jobType: row.job_type,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    payloadJson: normalizePayload(row.payload_json),
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    availableAt: row.available_at,
    lockedBy: row.locked_by,
    lockedAt: row.locked_at,
    lastError: row.last_error,
    lastStartedAt: row.last_started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizePayload(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? parsed as Record<string, unknown>
      : {};
  }

  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {};
}
