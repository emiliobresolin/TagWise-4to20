export type WorkerJobStatus = 'queued' | 'running' | 'retryable' | 'succeeded' | 'failed';

export interface WorkerJobRecord {
  id: string;
  jobType: string;
  idempotencyKey: string;
  status: WorkerJobStatus;
  payloadJson: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  availableAt: string;
  lockedBy: string | null;
  lockedAt: string | null;
  lastError: string | null;
  lastStartedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueWorkerJobInput {
  id?: string;
  jobType: string;
  idempotencyKey: string;
  payloadJson: Record<string, unknown>;
  maxAttempts: number;
  availableAt: string;
  createdAt: string;
}

export interface WorkerJobHandler {
  jobType: string;
  handle(job: WorkerJobRecord): Promise<void>;
}

export interface WorkerJobProcessingSummary {
  resumedJobIds: string[];
  processedJobIds: string[];
  succeededJobIds: string[];
  retryableJobIds: string[];
  failedJobIds: string[];
}
