import type { StructuredLogger } from '../platform/diagnostics/structuredLogger';
import { WorkerJobService } from '../modules/worker-jobs/workerJobService';

export interface WorkerJobLoopHandle {
  stop(): void;
}

export function startWorkerJobLoop(input: {
  service: WorkerJobService;
  logger: StructuredLogger;
  intervalMs?: number;
}): WorkerJobLoopHandle {
  const intervalMs = input.intervalMs ?? 5000;
  let running = false;

  const tick = () => {
    if (running) {
      return;
    }

    running = true;
    void input.service.processReadyJobs({ limit: 10 })
      .then((summary) => {
        if (summary.processedJobIds.length > 0 || summary.resumedJobIds.length > 0) {
          input.logger.info('worker.jobs.processed', {
            summary,
          });
        }
      })
      .catch((error) => {
        input.logger.error('worker.jobs.failed', error);
      })
      .finally(() => {
        running = false;
      });
  };

  tick();
  const timer = setInterval(tick, intervalMs);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
