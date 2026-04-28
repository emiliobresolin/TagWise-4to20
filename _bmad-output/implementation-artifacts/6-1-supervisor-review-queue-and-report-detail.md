# Story 6.1: Supervisor Review Queue and Report Detail

Status: review

## Metadata
- Story key: 6-1-supervisor-review-queue-and-report-detail
- Story map ID: E6-S1
- Epic: Epic 6 - Connected Review, Approval, and Audit Closure
- Release phase: End-to-End Demo

## User Story
As a supervisor, I want a connected review queue and report detail view so I can assess submitted field work efficiently.

## Scope
supervisor queue, report detail screen, display of execution summary, evidence references, risk flags, justifications, and approval history placeholders.

## Key Functional Requirements Covered
FR-11, Approval / RBAC requirements.

## Technical Notes / Implementation Approach
queue should show only server-accepted reports within supervisor scope; detail view reads canonical backend state.

## Dependencies
- `E5-S4`.

## Risks
- showing local-only or pending-validation reports in the review queue will create confusion and premature decisions.

## Acceptance Criteria
1. Supervisor sees only reviewable reports in assigned scope.
2. Detail view shows the approved report data needed for review.
3. Report detail distinguishes current state, risk flags, and pending evidence status clearly.
4. Review screens require connectivity for official actions.

## Validation / Test Notes
- role/scope API tests, queue filtering tests, connected-only action gating test.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)

## Dev Agent Record

### Implementation Plan
- Selected Story 6.1 immediately after approved/closed Story 5.4 because `story-index.md` orders 6.1 next, `story-map.md` starts Phase 6 with E6-S1 after E5-S4, and the story dependency is only `E5-S4`.
- Implement a read-only supervisor review boundary over server-accepted per-tag report submissions.
- Keep Story 6.1 narrow: queue/detail only, no approve, return, escalation, manager queue, approval decision persistence, work-package roll-up, or returned-report re-entry.

### Scope Adjustment
- Minimal documented adjustment: added a small `supervisor_review_routes` table and seed routing because Story 6.1 AC1 requires supervisor assigned scope, while the existing schema only held technician-assigned packages and accepted report submissions.
- Justification: PRD Approval Requirements define supervisors as seeing submissions routed to their review queue from assigned work packages; Architecture RBAC scope likewise names a routed supervisor review queue.
- Boundary preserved: the route table supports read scope only and does not add approval commands or decision history.

### Completion Notes
- Added backend supervisor review model, repository, and service with role-gated queue/detail read APIs.
- Added API endpoints for `GET /review/supervisor/reports` and `GET /review/supervisor/reports/:reportId`.
- Queue lists only server-accepted reports in `Submitted - Pending Supervisor Review` that are routed to the authenticated supervisor.
- Detail returns canonical report data from the accepted submission payload: execution summary, history summary, diagnosis summary, evidence references, risk flags, photo evidence status, and approval history placeholder.
- Added mobile supervisor review API client/service and a `Review` route in the app shell.
- Mobile review loading is connected-supervisor gated; offline/non-supervisor sessions do not call the review API.

### Validation Results
- `backend`: `npm run typecheck` - passed.
- `backend`: `npm test -- createApiRequestHandler migrations` - passed, 2 files / 11 tests.
- `backend`: `npm test` - passed, 9 files / 28 tests.
- `mobile`: `npm run typecheck` - passed.
- `mobile`: `npm test -- supervisorReview bootstrapLocalDatabase` - passed, 2 files / 4 tests.
- `mobile`: `npm test` - passed, 21 files / 110 tests.

## File List
- `backend/src/api/createApiRequestHandler.ts`
- `backend/src/api/createApiRequestHandler.test.ts`
- `backend/src/api/main.ts`
- `backend/src/modules/review/model.ts`
- `backend/src/modules/review/supervisorReviewRepository.ts`
- `backend/src/modules/review/supervisorReviewService.ts`
- `backend/src/platform/db/migrations.ts`
- `backend/src/platform/db/migrations.test.ts`
- `mobile/src/data/local/bootstrapLocalDatabase.test.ts`
- `mobile/src/data/local/repositories/appPreferencesRepository.ts`
- `mobile/src/data/local/repositories/mobileRuntimeErrorRepository.ts`
- `mobile/src/features/app-shell/model.ts`
- `mobile/src/features/review/model.ts`
- `mobile/src/features/review/supervisorReviewApiClient.ts`
- `mobile/src/features/review/supervisorReviewService.ts`
- `mobile/src/features/review/supervisorReviewService.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`

## Change Log
- 2026-04-28: Implemented Story 6.1 supervisor review queue/detail boundary with scoped routing, connected-supervisor mobile review loading, and queue/detail tests.
