import { describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';

import { runPostgresMigrations } from '../platform/db/migrations';
import { runWorkerResilienceDrill } from './workerResilienceDrill';

describe('runWorkerResilienceDrill', () => {
  it('proves restart recovery through a controlled durable worker-job drill', async () => {
    const database = newDb();
    const adapter = database.adapters.createPg();
    const pool = new adapter.Pool();
    await runPostgresMigrations(pool);

    const report = await runWorkerResilienceDrill({
      database: pool,
      idempotencyKey: 'worker-drill:controlled-release-check',
      startedAt: new Date('2026-05-02T14:00:00.000Z'),
    });

    expect(report).toMatchObject({
      passed: true,
      idempotencyKey: 'worker-drill:controlled-release-check',
      resumedStaleJobs: 1,
      sideEffectCount: 1,
      failedJobCount: 0,
    });
    expect(report.processedJobIds).toEqual([report.jobId]);

    await pool.end();
  });
});
