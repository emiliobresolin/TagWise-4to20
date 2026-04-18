# Story 3.6: History Comparison and Freshness Cues

Status: ready-for-dev

## Metadata
- Story key: 3-6-history-comparison-and-freshness-cues
- Story map ID: E3-S6
- Epic: Epic 3 - Template-Driven Field Execution
- Release phase: Vertical Slice

## User Story
As a technician, I want current results compared to cached prior history so I can spot drift or recurrence without leaving the tag workflow.

## Scope
current-versus-history display, freshness/staleness labels, age-unknown handling, recurrence cues.

## Key Functional Requirements Covered
FR-05.

## Technical Notes / Implementation Approach
compare only locally cached summaries; do not depend on live history fetch; preserve family/test-pattern relevance where the PRD calls for it.

## Dependencies
- `E2-S5`, `E3-S1`, `E3-S2`.

## Risks
- ambiguous history freshness will weaken trust in diagnosis and approval.

## Acceptance Criteria
1. Execution shell can show current values next to locally cached history.
2. Missing, stale, or age-unknown history states are clearly distinguished.
3. History comparison does not block execution when unavailable.
4. Recurrence cues can be rendered when present in the snapshot.

## Validation / Test Notes
- history rendering tests, stale/unknown state tests, offline comparison smoke test.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
