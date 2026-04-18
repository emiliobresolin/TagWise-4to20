# Story 6.4: Manager Review and Decision for Escalated Cases

Status: ready-for-dev

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

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
