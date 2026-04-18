# Story 6.2: Supervisor Approve and Return for Standard Cases

Status: ready-for-dev

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

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
