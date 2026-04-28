# Story 6.4: Manager Review and Decision for Escalated Cases

Status: review

## Metadata
- Story key: 6-4-manager-review-and-decision-for-escalated-cases
- Story map ID: E6-S4
- Epic: Epic 6 - Connected Review, Approval, and Audit Closure
- Release phase: First Release

## User Story
As a manager, I want to review escalated reports and approve or return them with traceable rationale so higher-risk decisions are controlled.

## Scope
manager queue, escalated report detail, approve action, return action with comments, connected-only validation.

## Key Functional Requirements Covered
FR-12, Approval lifecycle manager path.

## Technical Notes / Implementation Approach
show supervisor rationale alongside canonical report content; keep manager actions server-authoritative only.

## Dependencies
- `E6-S3`.

## Risks
- if manager screens diverge from supervisor report semantics, audit trails and rework loops will fragment.

## Acceptance Criteria
1. Manager sees only escalated reports in scope.
2. Manager can approve or return an escalated report while connected.
3. Manager return requires a comment.
4. Decision is stored as a distinct auditable action linked to the report.

## Validation / Test Notes
- manager queue tests, approve/return API tests, audit trace tests.

## Dev Agent Record
### Selected Next Story Verification
- Story index order places `6-4-manager-review-and-decision-for-escalated-cases` immediately after approved `6-3-supervisor-escalation-for-higher-risk-cases`.
- Story map E6-S4 matches this story file, depends on E6-S3, and is followed by E6-S5 approval history / work-package roll-up / returned-report re-entry.
- PRD FR-12 authorizes manager review only for escalated cases, manager approve/return, auditable manager decisions, mandatory return comments, and connected-only review actions.
- Architecture requires server-authoritative approval commands, state transition validation, required comments for returns/escalations, append-only approval history, and managers seeing explicitly escalated queues.

### Scope Implemented
- Added connected manager review queue at `GET /review/manager/reports`.
- Added connected escalated-report detail at `GET /review/manager/reports/:reportId`, including supervisor escalation rationale through approval history.
- Added manager approve and return commands at `POST /review/manager/reports/:reportId/approve` and `/return`.
- Enforced manager-only access, explicit manager route scope, pending-manager-review state precondition, and mandatory trimmed manager return comments.
- Persisted manager approval as final `Approved` and manager return as `Returned by Manager`.
- Persisted distinct report-linked audit events for `report.manager.approved` and `report.manager.returned`.
- Added mobile manager queue/detail/approve/return service/API integration and review-route UI behavior; successful manager decisions remove the report from the local manager queue view.

### Scope Adjustment
- Added `returned-by-manager` / `Returned by Manager` to report state constraints via migration `0010_manager_decision_states`.
- Justification: PRD lifecycle explicitly includes `Returned by Manager`, and Story 6.4 AC3 requires manager return with comments.
- Kept work-package roll-up, returned-report re-entry, full approval timeline polish, and package completion behavior deferred to E6-S5.

### Tests Added / Updated
- Backend API test for manager queue, manager detail, technician/supervisor forbidden access, mandatory manager return comment, manager return, stale manager decision conflict, manager approval, manager queue removal, and audit trace.
- Migration tests updated for schema version 10.
- Mobile review service tests updated for manager queue/detail/approve/return dispatch and blank manager return-comment blocking.

### Validation Results
- `cd backend && npm run typecheck` - passed.
- `cd backend && npm test -- createApiRequestHandler migrations reportSubmission` - passed, 4 files / 22 tests.
- `cd backend && npm test` - passed, 9 files / 32 tests.
- `cd mobile && npm run typecheck` - passed.
- `cd mobile && npm test -- supervisorReview` - passed, 1 file / 8 tests.
- `cd mobile && npm test` - passed, 21 files / 115 tests.
- `git diff --check` - passed.

### File List
- `_bmad-output/implementation-artifacts/6-4-manager-review-and-decision-for-escalated-cases.md`
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
