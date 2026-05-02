import type { QueryableDatabase } from '../platform/db/postgres';
import { WorkerJobRepository } from '../modules/worker-jobs/workerJobRepository';
import { WorkerJobService } from '../modules/worker-jobs/workerJobService';

export interface WorkerResilienceDrillReport {
  passed: boolean;
  jobId: string;
  idempotencyKey: string;
  resumedStaleJobs: number;
  processedJobIds: string[];
  sideEffectCount: number;
  failedJobCount: number;
}

export async function runWorkerResilienceDrill(input: {
  database: QueryableDatabase;
  idempotencyKey?: string;
  startedAt?: Date;
}): Promise<WorkerResilienceDrillReport> {
  const startedAt = input.startedAt ?? new Date();
  const restartedAt = new Date(startedAt.getTime() + 3 * 60 * 1000);
  const repository = new WorkerJobRepository(input.database);
  const idempotencyKey =
    input.idempotencyKey ?? `worker-restart-drill:${startedAt.toISOString()}`;
  const job = await repository.enqueue({
    jobType: 'ops.restart-drill',
    idempotencyKey,
    payloadJson: {
      purpose: 'release worker restart resilience drill',
    },
    maxAttempts: 3,
    availableAt: startedAt.toISOString(),
    createdAt: startedAt.toISOString(),
  });

  await repository.claimReadyJobById(
    job.id,
    'worker-drill-before-restart',
    startedAt.toISOString(),
  );

  const service = new WorkerJobService(repository, {
    workerId: 'worker-drill-after-restart',
    now: () => restartedAt,
    staleRunningJobMs: 60_000,
    handlers: [
      {
        jobType: 'ops.restart-drill',
        handle: async (drillJob) => {
          await repository.recordDrillSideEffect({
            jobId: drillJob.id,
            idempotencyKey: drillJob.idempotencyKey,
            processedAt: restartedAt.toISOString(),
          });
        },
      },
    ],
  });
  const summary = await service.processReadyJobs({ limit: 5 });
  const sideEffectCount = await repository.countDrillSideEffects(job.id);
  const failedJobs = await repository.listFailedJobs();
  const passed =
    summary.resumedJobIds.includes(job.id) &&
    summary.succeededJobIds.includes(job.id) &&
    sideEffectCount === 1 &&
    failedJobs.length === 0;

  return {
    passed,
    jobId: job.id,
    idempotencyKey,
    resumedStaleJobs: summary.resumedJobIds.length,
    processedJobIds: summary.processedJobIds,
    sideEffectCount,
    failedJobCount: failedJobs.length,
  };
}
