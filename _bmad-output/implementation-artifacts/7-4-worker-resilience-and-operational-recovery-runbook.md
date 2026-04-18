# Story 7.4: Worker Resilience and Operational Recovery Runbook

Status: ready-for-dev

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

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
