# Story 5.1: Local Submission and Outbound Sync Queue

Status: ready-for-dev

## Metadata
- Story key: 5-1-local-submission-and-outbound-sync-queue
- Story map ID: E5-S1
- Epic: Epic 5 - Submission, Sync, and Pending Validation
- Release phase: Vertical Slice

## User Story
As a technician, I want to submit a completed per-tag report even while offline so field work is not blocked by connectivity.

## Scope
local submit action, report state transition to queued/pending sync, outbound queue item creation, queue dependency metadata.

## Key Functional Requirements Covered
FR-10, FR-13, Sync lifecycle baseline.

## Technical Notes / Implementation Approach
create queue items with idempotency keys and dependency metadata; lock technician ownership rules after submit according to the approved lifecycle.

## Dependencies
- `E4-S4`.

## Risks
- weak local queue identity will create duplicate submissions and hard-to-debug sync issues.

## Acceptance Criteria
1. Technician can submit a report while offline.
2. Submission moves the local report into `Submitted - Pending Sync`.
3. Queue items are created for the report and its pending evidence.
4. Submitted local records survive app restart.

## Validation / Test Notes
- queue persistence tests, offline submit tests, duplicate-submit guard tests.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
