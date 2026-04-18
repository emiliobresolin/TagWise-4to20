# Story 6.1: Supervisor Review Queue and Report Detail

Status: ready-for-dev

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
