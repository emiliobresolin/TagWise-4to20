import type {
  WorkerJobHandler,
  WorkerJobProcessingSummary,
  WorkerJobRecord,
} from './model';
import { WorkerJobRepository } from './workerJobRepository';

export interface WorkerJobServiceOptions {
  workerId: string;
  handlers: WorkerJobHandler[];
  now?: () => Date;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  staleRunningJobMs?: number;
}

export class WorkerJobService {
  private readonly handlers: Map<string, WorkerJobHandler>;
  private readonly now: () => Date;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly staleRunningJobMs: number;

  constructor(
    private readonly repository: WorkerJobRepository,
    private readonly options: WorkerJobServiceOptions,
  ) {
    this.handlers = new Map(options.handlers.map((handler) => [handler.jobType, handler]));
    this.now = options.now ?? (() => new Date());
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 60_000;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 60 * 60 * 1000;
    this.staleRunningJobMs = options.staleRunningJobMs ?? 5 * 60 * 1000;
  }

  async processReadyJobs(input: { limit?: number } = {}): Promise<WorkerJobProcessingSummary> {
    const limit = input.limit ?? 10;
    const summary: WorkerJobProcessingSummary = {
      resumedJobIds: [],
      processedJobIds: [],
      succeededJobIds: [],
      retryableJobIds: [],
      failedJobIds: [],
    };
    const now = this.now();
    const resumed = await this.repository.resetStaleRunningJobs({
      cutoff: new Date(now.getTime() - this.staleRunningJobMs).toISOString(),
      resumedAt: now.toISOString(),
      message: 'Worker stopped before completing the job.',
    });
    summary.resumedJobIds.push(...resumed.map((job) => job.id));
    summary.failedJobIds.push(...resumed.filter((job) => job.status === 'failed').map((job) => job.id));

    for (let index = 0; index < limit; index += 1) {
      const job = await this.repository.claimNextReadyJob(
        this.options.workerId,
        this.now().toISOString(),
      );
      if (!job) {
        break;
      }

      summary.processedJobIds.push(job.id);
      const result = await this.runJob(job);
      if (result === 'succeeded') {
        summary.succeededJobIds.push(job.id);
      } else if (result === 'retryable') {
        summary.retryableJobIds.push(job.id);
      } else {
        summary.failedJobIds.push(job.id);
      }
    }

    return summary;
  }

  private async runJob(job: WorkerJobRecord): Promise<'succeeded' | 'retryable' | 'failed'> {
    const handler = this.handlers.get(job.jobType);
    const now = this.now().toISOString();
    if (!handler) {
      await this.repository.markFailed({
        id: job.id,
        lastError: `No worker handler registered for job type ${job.jobType}.`,
        updatedAt: now,
      });
      return 'failed';
    }

    try {
      await handler.handle(job);
      await this.repository.markSucceeded(job.id, this.now().toISOString());
      return 'succeeded';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Worker job failed.';
      if (job.attemptCount >= job.maxAttempts) {
        await this.repository.markFailed({
          id: job.id,
          lastError: message,
          updatedAt: this.now().toISOString(),
        });
        return 'failed';
      }

      await this.repository.markRetryable({
        id: job.id,
        lastError: message,
        availableAt: this.calculateNextAvailableAt(job).toISOString(),
        updatedAt: this.now().toISOString(),
      });
      return 'retryable';
    }
  }

  private calculateNextAvailableAt(job: WorkerJobRecord): Date {
    const now = this.now();
    const delay = Math.min(
      this.retryBaseDelayMs * 2 ** Math.max(0, job.attemptCount - 1),
      this.retryMaxDelayMs,
    );

    return new Date(now.getTime() + delay);
  }
}
