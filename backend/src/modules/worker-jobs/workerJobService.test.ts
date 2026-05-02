import { describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';

import { runPostgresMigrations } from '../../platform/db/migrations';
import { WorkerJobRepository } from './workerJobRepository';
import { WorkerJobService } from './workerJobService';

describe('WorkerJobService', () => {
  it('resumes a stale running job after restart and records one idempotent side effect', async () => {
    const database = newDb();
    const adapter = database.adapters.createPg();
    const pool = new adapter.Pool();
    await runPostgresMigrations(pool);

    const repository = new WorkerJobRepository(pool);
    const queued = await repository.enqueue({
      jobType: 'ops.restart-drill',
      idempotencyKey: 'worker-drill:restart-safe',
      payloadJson: { drill: true },
      maxAttempts: 3,
      availableAt: '2026-05-02T13:00:00.000Z',
      createdAt: '2026-05-02T13:00:00.000Z',
    });

    const claimed = await repository.claimReadyJobById(
      queued.id,
      'worker-before-restart',
      '2026-05-02T13:00:00.000Z',
    );
    expect(claimed).toMatchObject({
      id: queued.id,
      status: 'running',
      attemptCount: 1,
    });

    const service = new WorkerJobService(repository, {
      workerId: 'worker-after-restart',
      now: () => new Date('2026-05-02T13:03:00.000Z'),
      staleRunningJobMs: 60_000,
      handlers: [
        {
          jobType: 'ops.restart-drill',
          handle: async (job) => {
            await repository.recordDrillSideEffect({
              jobId: job.id,
              idempotencyKey: job.idempotencyKey,
              processedAt: '2026-05-02T13:03:00.000Z',
            });
          },
        },
      ],
    });

    const summary = await service.processReadyJobs({ limit: 5 });
    const secondPass = await service.processReadyJobs({ limit: 5 });
    const completed = await repository.getById(queued.id);

    expect(summary.resumedJobIds).toEqual([queued.id]);
    expect(summary.succeededJobIds).toEqual([queued.id]);
    expect(secondPass.processedJobIds).toEqual([]);
    expect(completed).toMatchObject({
      status: 'succeeded',
      attemptCount: 2,
      completedAt: '2026-05-02T13:03:00.000Z',
    });
    expect(await repository.countDrillSideEffects(queued.id)).toBe(1);

    await pool.end();
  });

  it('marks exhausted retryable jobs as failed and exposes them for operations follow-up', async () => {
    const database = newDb();
    const adapter = database.adapters.createPg();
    const pool = new adapter.Pool();
    await runPostgresMigrations(pool);

    const repository = new WorkerJobRepository(pool);
    const queued = await repository.enqueue({
      jobType: 'ops.always-fails',
      idempotencyKey: 'worker-drill:failed-visible',
      payloadJson: {},
      maxAttempts: 2,
      availableAt: '2026-05-02T13:00:00.000Z',
      createdAt: '2026-05-02T13:00:00.000Z',
    });
    let now = new Date('2026-05-02T13:00:00.000Z');
    const service = new WorkerJobService(repository, {
      workerId: 'worker-retry-test',
      now: () => now,
      retryBaseDelayMs: 60_000,
      handlers: [
        {
          jobType: 'ops.always-fails',
          handle: async () => {
            throw new Error('drill handler failed');
          },
        },
      ],
    });

    const firstAttempt = await service.processReadyJobs({ limit: 5 });
    now = new Date('2026-05-02T13:01:00.000Z');
    const secondAttempt = await service.processReadyJobs({ limit: 5 });
    const failedJobs = await repository.listFailedJobs();

    expect(firstAttempt.retryableJobIds).toEqual([queued.id]);
    expect(secondAttempt.failedJobIds).toEqual([queued.id]);
    expect(failedJobs).toHaveLength(1);
    expect(failedJobs[0]).toMatchObject({
      id: queued.id,
      status: 'failed',
      attemptCount: 2,
      lastError: 'drill handler failed',
    });

    await pool.end();
  });
});
