# Story 7.4: Worker Resilience and Operational Recovery Runbook

Status: review

## Metadata
- Story key: 7-4-worker-resilience-and-operational-recovery-runbook
- Story map ID: E7-S4
- Epic: Epic 7 - Release Readiness, Deployment, and Optional AI Assist
- Release phase: Release Hardening

## User Story
As an operations owner, I want background jobs and recovery steps to be resilient so evidence finalization and validation flows survive restarts and outages.

## Scope
worker retry hardening, restart-safe job handling, dead-letter/failed-job visibility, recovery runbook for sync/media/validation incidents.

## Key Functional Requirements Covered
Architecture worker resiliency, pending validation reliability.

## Technical Notes / Implementation Approach
persist retryable jobs durably; ensure job handlers are idempotent; document recovery steps for stuck queues and failed finalization.

## Dependencies
- `E1-S2`, `E5-S2`, `E5-S4`, `E7-S2`.

## Risks
- restart-unsafe jobs can create hidden data loss or repeated side effects.

## Acceptance Criteria
1. Worker can resume retryable jobs after restart without duplicating side effects.
2. Failed jobs are visible for operational follow-up.
3. Recovery guidance exists for common sync/media/validation failure modes.
4. Release environment can prove worker restart resilience through a controlled drill.

## Validation / Test Notes
- worker restart test, idempotency tests, operational drill checklist.

## Dev Agent Record

### Implementation Summary
- Added durable `worker_jobs` storage with idempotency keys, retryable/running/succeeded/failed states, attempt tracking, stale-running recovery, and failed-job indexes for operations follow-up.
- Added `WorkerJobRepository` and `WorkerJobService` with restart-safe stale job resumption, exponential retry scheduling, exhausted-attempt failure visibility, and handler-based idempotent execution.
- Wired the worker process to run a background durable-job loop and process the operational restart-drill job type without duplicating drill side effects.
- Added `worker_job_drill_events` and `npm run worker:resilience:drill` to prove restart recovery through a controlled drill.
- Extended release observability to expose retryable and failed worker jobs in queue depth, alerts, and dashboard checks.
- Included worker job tables in backup/restore verification coverage.
- Documented operational recovery guidance for failed jobs, stuck running jobs, pending evidence finalization, report validation failures, and the controlled restart drill.

### Artifact Notes
- No `sprint-status.yaml` exists in `_bmad-output/implementation-artifacts`; Story 7.4 selection used `story-index.md` order and Story 7.4 `ready-for-dev` status.
- Story 7.4 did not contain a Tasks/Subtasks checklist. Implementation was mapped directly to AC1-AC4 and validation notes.
- Older story records remaining in `review` are treated as artifact hygiene because the ordered Epic 7 records and repo state show Story 7.3 is passed/closed and Story 7.4 is the next ready story.

### Files Changed
- `backend/package.json`
- `backend/src/modules/worker-jobs/model.ts`
- `backend/src/modules/worker-jobs/workerJobRepository.ts`
- `backend/src/modules/worker-jobs/workerJobService.ts`
- `backend/src/modules/worker-jobs/workerJobService.test.ts`
- `backend/src/ops/backupRestoreVerification.ts`
- `backend/src/ops/releaseObservability.ts`
- `backend/src/ops/releaseObservability.test.ts`
- `backend/src/ops/workerResilienceDrill.ts`
- `backend/src/ops/workerResilienceDrill.test.ts`
- `backend/src/ops/workerResilienceDrillCli.ts`
- `backend/src/platform/db/migrations.ts`
- `backend/src/platform/db/migrations.test.ts`
- `backend/src/worker/main.ts`
- `backend/src/worker/workerJobLoop.ts`
- `docs/ops/story-7-4-worker-resilience-runbook.md`
- `_bmad-output/implementation-artifacts/7-4-worker-resilience-and-operational-recovery-runbook.md`

### Validation Summary
- `cd backend && npm test -- workerJobService workerResilienceDrill migrations releaseObservability backupRestoreVerification` - passed, 5 files / 11 tests.
- `cd backend && npm run typecheck` - passed.
- `cd backend && npm test` - passed, 15 files / 74 tests.
- `git diff --check` - passed with CRLF line-ending warnings only.
- Generated/cache file check - clean after restoring Vitest generated output.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
