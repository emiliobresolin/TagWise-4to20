# Story 7.4 Worker Resilience and Recovery Runbook

## Durable Worker Jobs

- Retryable backend work is stored in `worker_jobs`.
- Job identity is deduplicated by `idempotency_key`.
- Workers claim ready jobs by moving them to `running` with `locked_by` and `locked_at`.
- Restart recovery resets stale `running` jobs back to `retryable` unless their attempts are exhausted.
- Exhausted jobs move to `failed` and stay visible for operations follow-up.

## Recovery Checks

- Run `npm run release:observability` from `backend` and inspect:
  - `snapshot.workerJobs.failed`
  - `snapshot.workerJobs.retryable`
  - dashboard check `Failed worker jobs`
- Failed jobs require manual triage before requeueing or data repair.
- Stale evidence finalization remains visible through the Story 7.2 stale finalization signal.

## Controlled Restart Drill

Run from `backend` against the release environment:

```bash
npm run worker:resilience:drill
```

The drill:

1. Creates one durable restart-drill worker job with a unique idempotency key.
2. Claims it as if a worker started processing.
3. Simulates worker restart before completion.
4. Starts a replacement worker pass that resumes the stale job.
5. Records one idempotent side effect in `worker_job_drill_events`.
6. Fails the command if the job is not resumed, not processed, duplicated, or failed.

## Common Incidents

### Failed Worker Jobs

1. Read `worker_jobs` where `status = 'failed'`.
2. Inspect `job_type`, `idempotency_key`, `attempt_count`, and `last_error`.
3. Confirm whether the side effect is already present before requeueing.
4. Requeue only after the root cause is understood and the handler is idempotent.

### Stuck Running Jobs

1. Confirm the owning worker process is gone or unhealthy.
2. Let the worker loop resume jobs automatically after the stale-running window.
3. If urgent, restart the worker service and rerun `npm run release:observability`.

### Pending Evidence Finalization

1. Check release observability for stale pending evidence finalization.
2. Verify object storage availability and signed upload/finalization API health.
3. Do not delete local mobile evidence while finalization is pending.
4. Retry from the mobile sync flow after object storage/API recovery.

### Report Validation Failures

1. Use report submission API responses and local sync issue state to identify rejected records.
2. Preserve server and local report history; do not overwrite accepted records manually.
3. Rework/resubmit through the normal returned-report or sync-retry flow.
