# Story 6.2: Supervisor Approve and Return for Standard Cases

Status: review

## Metadata
- Story key: 6-2-supervisor-approve-and-return-for-standard-cases
- Story map ID: E6-S2
- Epic: Epic 6 - Connected Review, Approval, and Audit Closure
- Release phase: End-to-End Demo

## User Story
As a supervisor, I want to approve standard cases quickly or return them with comments so technicians get clear and auditable outcomes.

## Scope
approve action, return action, mandatory return comments, state transitions, audit event creation for standard cases.

## Key Functional Requirements Covered
FR-11, Approval lifecycle standard path.

## Technical Notes / Implementation Approach
enforce connected server-side command validation; keep supervisors from editing technician evidence directly.

## Dependencies
- `E6-S1`.

## Risks
- if return comments are optional or weakly captured, technician rework will be ambiguous.

## Acceptance Criteria
1. Supervisor can approve a standard report while connected.
2. Supervisor can return a report only with a mandatory comment.
3. Server records auditable approval or return decisions.
4. Returned reports leave a clear state for technician rework.

## Validation / Test Notes
- approval/return API tests, audit persistence tests, returned-state regression tests.

## Dev Agent Record
### Selected Next Story Verification
- Story index order places `6-2-supervisor-approve-and-return-for-standard-cases` immediately after approved `6-1-supervisor-review-queue-and-report-detail`.
- Story map E6-S2 matches this file and depends only on E6-S1.
- PRD FR-11 and Approval Requirements authorize supervisor approve/return for standard cases, mandatory return comments, connected-only official review actions, and auditable decisions.
- Architecture requires server-authoritative approval transitions, reviewer command validation, no reviewer edits to technician evidence/calculations, and durable audit events.

### Scope Implemented
- Added connected supervisor approve and return API commands for routed, pending-review reports.
- Enforced supervisor-only command access and mandatory trimmed return comments.
- Persisted standard approval/return lifecycle transitions to `Approved` and `Returned by Supervisor`.
- Recorded report-linked audit events with actor, role, timestamp, prior/next state, target report, correlation id, and return comment where applicable.
- Added mobile connected supervisor approve/return service methods and review-detail actions; successful decisions remove the report from the local review queue view.

### Scope Adjustment
- Broadened `report_submission_records` report/lifecycle state constraints to include `approved` / `Approved` and `returned-by-supervisor` / `Returned by Supervisor`.
- Justification: Story 6.2 AC requires approval/return state transitions, and PRD lifecycle definitions explicitly include `Approved` and `Returned by Supervisor`.
- Kept full approval history UI, returned-report re-entry, escalation, manager queue, and work-package roll-up deferred to later E6 stories.

### Tests Added / Updated
- Backend API tests for supervisor approve, technician-forbidden approval, stale decision conflict, mandatory return comment, returned-state persistence, and audit event persistence.
- Migration tests updated for schema version 8.
- Mobile supervisor review service tests for approve/return command dispatch and blank return-comment blocking.

### Validation Results
- `cd backend && npm run typecheck` - passed.
- `cd backend && npm test -- createApiRequestHandler migrations reportSubmission` - passed, 4 files / 20 tests.
- `cd backend && npm test` - passed, 9 files / 30 tests.
- `cd mobile && npm run typecheck` - passed.
- `cd mobile && npm test -- supervisorReview` - passed, 1 file / 5 tests.
- `cd mobile && npm test` - passed, 21 files / 112 tests.

### File List
- `_bmad-output/implementation-artifacts/6-2-supervisor-approve-and-return-for-standard-cases.md`
- `backend/src/api/createApiRequestHandler.ts`
- `backend/src/api/createApiRequestHandler.test.ts`
- `backend/src/modules/report-submissions/model.ts`
- `backend/src/modules/report-submissions/reportSubmissionService.ts`
- `backend/src/modules/review/model.ts`
- `backend/src/modules/review/supervisorReviewRepository.ts`
- `backend/src/modules/review/supervisorReviewService.ts`
- `backend/src/platform/db/migrations.ts`
- `backend/src/platform/db/migrations.test.ts`
- `mobile/src/features/review/model.ts`
- `mobile/src/features/review/supervisorReviewApiClient.ts`
- `mobile/src/features/review/supervisorReviewService.ts`
- `mobile/src/features/review/supervisorReviewService.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
