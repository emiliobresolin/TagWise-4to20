# Story 5.4: Server Validation, Conflict Rejection, and Post-Sync Refresh

Status: ready-for-dev

## Metadata
- Story key: 5-4-server-validation-conflict-rejection-and-post-sync-refresh
- Story map ID: E5-S4
- Epic: Epic 5 - Submission, Sync, and Pending Validation
- Release phase: End-to-End Demo

## User Story
As a supervisor or technician, I want the server to authoritatively accept or reject submissions so review queues and local devices stay consistent.

## Scope
server-side submission validation, pending-validation state, conflict rejection, structured sync issue reasons, local status refresh after server outcome.

## Key Functional Requirements Covered
FR-10, FR-13, Authoritative state mapping, Reviewer connectivity boundary enablement.

## Technical Notes / Implementation Approach
validate scope, lifecycle transition, minimum evidence, required justification, and evidence-arrival rules; reject conflicting edits rather than merging silently.

## Dependencies
- `E5-S1`, `E5-S2`, `E5-S3`.

## Risks
- vague sync-issue reasons will slow field recovery and support diagnosis.

## Acceptance Criteria
1. Server accepts only valid submissions into `Submitted - Pending Supervisor Review`.
2. Invalid submissions move into `sync issue` with a structured reason.
3. Conflicting updates are rejected without silent merge.
4. Local report state refreshes to the server-authoritative outcome after sync.

## Validation / Test Notes
- API validation tests, conflict tests, post-sync state reconciliation tests.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
