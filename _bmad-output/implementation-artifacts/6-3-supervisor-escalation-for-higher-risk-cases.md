# Story 6.3: Supervisor Escalation for Higher-Risk Cases

Status: review

## Metadata
- Story key: 6-3-supervisor-escalation-for-higher-risk-cases
- Story map ID: E6-S3
- Epic: Epic 6 - Connected Review, Approval, and Audit Closure
- Release phase: First Release

## User Story
As a supervisor, I want to escalate higher-risk cases with rationale so manager review is reserved for the right submissions.

## Scope
escalation command, mandatory escalation rationale, higher-risk routing to manager queue, audit event persistence.

## Key Functional Requirements Covered
FR-11, FR-12, Approval lifecycle escalation path.

## Technical Notes / Implementation Approach
support supervisor judgment aided by product signals; do not auto-route purely from a rules engine.

## Dependencies
- `E6-S1`.

## Risks
- over-automating escalation will conflict with the approved PRD.

## Acceptance Criteria
1. Supervisor can escalate a report while connected with mandatory rationale.
2. Escalated report leaves supervisor standard queue and enters manager queue.
3. Escalation decision is auditable and visible in report history.
4. Escalation does not modify technician evidence or calculations.

## Validation / Test Notes
- escalation command tests, queue-routing tests, history visibility tests.

## Dev Agent Record
### Selected Next Story Verification
- Story index order places `6-3-supervisor-escalation-for-higher-risk-cases` immediately after approved `6-2-supervisor-approve-and-return-for-standard-cases`.
- Story map E6-S3 matches this story file and follows E6-S2; no artifact conflict was found.
- PRD FR-11 and Approval Requirements authorize supervisor-initiated escalation, mandatory escalation comments/rationale, connected-only official review actions, manager visibility only for explicitly escalated submissions, and server-validated authoritative transitions.
- Architecture requires approval commands to be server-authoritative, validated by role and current state, persisted with append-only audit events, and routed to the next reviewer without changing technician evidence or calculations.

### Scope Implemented
- Added connected supervisor escalation command at `POST /review/supervisor/reports/:reportId/escalate`.
- Enforced supervisor-only access, routed report scope, pending-review state precondition, and mandatory trimmed escalation rationale.
- Persisted deterministic state transition from `Submitted - Pending Supervisor Review` to `Escalated - Pending Manager Review`.
- Added durable manager route persistence for explicitly escalated reports while keeping manager queue UI/API and manager decisions out of scope.
- Persisted escalation audit event with actor, role, timestamp, correlation id, prior/next state, report target, rationale, manager route, and product signals.
- Added approval-history items to routed report detail so escalation audit history is visible without adding approval roll-up or manager decision behavior.
- Added mobile supervisor escalation service/API/client integration and review-detail action; successful server escalation removes the report from the local supervisor queue view.

### Scope Adjustment
- Added `manager_review_routes` schema now as the minimal durable data route needed to satisfy AC2: escalated reports must leave the supervisor standard queue and enter manager queue.
- No manager-facing queue endpoint, manager approval, escalation decision UI beyond the supervisor command, approval roll-up, or package completion behavior was implemented; those remain later E6 scope.
- Product signals are recorded as context for supervisor judgment, not used for automatic escalation routing, matching PRD/Story guidance.

### Tests Added / Updated
- Backend API test for mandatory escalation rationale, technician/manager forbidden escalation, successful escalation, supervisor queue removal, manager route persistence, audit metadata, history visibility, and stale 409 conflict.
- Backend migration test updated for schema version 9 and `manager_review_routes`.
- Mobile supervisor review service tests updated for escalation dispatch, trimmed rationale, and blank-rationale blocking.

### Validation Results
- `cd backend && npm run typecheck` - passed.
- `cd backend && npm test -- createApiRequestHandler migrations reportSubmission` - passed, 4 files / 21 tests.
- `cd backend && npm test` - passed, 9 files / 31 tests.
- `cd mobile && npm run typecheck` - passed.
- `cd mobile && npm test -- supervisorReview` - passed, 1 file / 6 tests.
- `cd mobile && npm test` - passed, 21 files / 113 tests.

### File List
- `_bmad-output/implementation-artifacts/6-3-supervisor-escalation-for-higher-risk-cases.md`
- `backend/src/api/createApiRequestHandler.ts`
- `backend/src/api/createApiRequestHandler.test.ts`
- `backend/src/api/main.ts`
- `backend/src/modules/report-submissions/model.ts`
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
