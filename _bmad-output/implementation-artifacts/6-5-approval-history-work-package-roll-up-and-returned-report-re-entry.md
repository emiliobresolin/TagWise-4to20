# Story 6.5: Approval History, Work-Package Roll-Up, and Returned-Report Re-entry

Status: ready-for-dev

## Metadata
- Story key: 6-5-approval-history-work-package-roll-up-and-returned-report-re-entry
- Story map ID: E6-S5
- Epic: Epic 6 - Connected Review, Approval, and Audit Closure
- Release phase: First Release

## User Story
As a technician or reviewer, I want approval history and work-package status to stay coherent so I can understand where each tag report stands and what needs rework.

## Scope
approval history timeline, work-package roll-up calculation, returned-report re-entry for technician edits/resubmission, visible comment history.

## Key Functional Requirements Covered
FR-09 approval history, Work package roll-up rule, FR-14.

## Technical Notes / Implementation Approach
derive work-package status from child report states; preserve immutable decision history; re-open returned report into technician-owned editable state only.

## Dependencies
- `E6-S2`, `E6-S3`, `E6-S4`.

## Risks
- treating the work package as the review unit will violate the approved per-tag lifecycle model.

## Acceptance Criteria
1. Report detail shows full approval/return/escalation history.
2. Work-package status rolls up correctly from child per-tag report outcomes.
3. Returned reports can be reopened by the technician for rework and later resubmission.
4. Prior approval decisions remain visible after resubmission.

## Validation / Test Notes
- lifecycle transition tests, roll-up calculation tests, rework/resubmit regression tests.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
