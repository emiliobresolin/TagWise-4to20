# Story 6.3: Supervisor Escalation for Higher-Risk Cases

Status: ready-for-dev

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

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
