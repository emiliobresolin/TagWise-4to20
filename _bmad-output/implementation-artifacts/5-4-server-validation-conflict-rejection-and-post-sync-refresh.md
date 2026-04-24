# Story 5.4: Server Validation, Conflict Rejection, and Post-Sync Refresh

Status: review

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

## Dev Agent Record

### Implementation Plan
- Selected Story 5.4 from `story-index.md` immediately after approved/closed Story 5.3.
- Implement the server-authoritative report submission boundary required by PRD/Architecture/Epics: valid reports move to `Submitted - Pending Supervisor Review`; invalid reports return structured sync issue reasons; conflicting submitted versions are rejected.
- Extend the mobile submitted-report sync path to send the report for server validation after evidence transport and refresh the local draft/report sync state from the server outcome.

### Completion Notes
- Added backend report submission persistence, validation service, API route, and migration for accepted server-authoritative submissions.
- Added validation for assigned scope, lifecycle transition, minimum evidence, required justifications, required finalized photo evidence, and conflicting submitted versions.
- Extended mobile sync to retry `submit-report` queue items, submit pending reports for validation, refresh accepted reports to `submitted-pending-review` / `Submitted - Pending Supervisor Review`, and keep rejected submissions queued with structured sync issue metadata.
- Scope adjustment surfaced and applied: Story 5.4 required a narrow report-submission API/service boundary, not evidence-upload changes alone, because the approved docs state reviewable state begins only after E5-S4 server acceptance.

### Validation Results
- `backend`: `npm run typecheck` - passed.
- `backend`: `npm test` - passed, 7 files / 20 tests.
- `mobile`: `npm run typecheck` - passed.
- `mobile`: `npm test` - passed, 20 files / 106 tests.
- Focused backend API/migration tests: `npm test -- createApiRequestHandler.test.ts migrations.test.ts` - passed, 2 files / 10 tests.
- Focused mobile sync tests: `npm test -- evidenceUploadOrchestrator.test.ts syncStateService.test.ts sharedExecutionShellService.test.ts` - passed, 3 files / 38 tests.

## File List
- `backend/src/api/createApiRequestHandler.ts`
- `backend/src/api/createApiRequestHandler.test.ts`
- `backend/src/api/main.ts`
- `backend/src/modules/report-submissions/model.ts`
- `backend/src/modules/report-submissions/reportSubmissionRepository.ts`
- `backend/src/modules/report-submissions/reportSubmissionService.ts`
- `backend/src/platform/db/migrations.ts`
- `backend/src/platform/db/migrations.test.ts`
- `mobile/src/features/execution/model.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/sync/evidenceUploadApiClient.ts`
- `mobile/src/features/sync/evidenceUploadOrchestrator.ts`
- `mobile/src/features/sync/evidenceUploadOrchestrator.test.ts`
- `mobile/src/features/sync/syncStateService.ts`
- `mobile/src/features/sync/syncStateService.test.ts`

## Change Log
- 2026-04-24: Implemented Story 5.4 server validation, conflict rejection, structured sync issues, and post-sync local refresh.
