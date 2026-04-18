# Story 3.3: Pressure, Temperature/RTD, and Level Transmitter Template Pack

Status: ready-for-dev

## Metadata
- Story key: 3-3-pressure-temperature-rtd-and-level-transmitter-template-pack
- Story map ID: E3-S3
- Epic: Epic 3 - Template-Driven Field Execution
- Release phase: Vertical Slice

## User Story
As a technician, I want the core transmitter templates available in the shared shell so I can perform the approved v1 test patterns on common field instruments.

## Scope
pressure transmitter templates, temperature/RTD input templates, level transmitter templates, their approved test patterns, evidence expectations, and acceptance semantics.

## Key Functional Requirements Covered
FR-04, FR-08 baseline, `Initial V1 Instrument Family / Template Scope`.

## Technical Notes / Implementation Approach
implement only the approved v1 templates and acceptance styles from the PRD; reuse common transmitter input components where possible.

## Dependencies
- `E3-S1`, `E3-S2`.

## Risks
- trying to over-generalize beyond the approved v1 set will delay the first usable slice.

## Acceptance Criteria
1. Pressure transmitter templates support approved v1 test patterns from the PRD.
2. Temperature/RTD templates support approved v1 test patterns from the PRD.
3. Level transmitter templates support approved v1 test patterns from the PRD.
4. Each template declares minimum submission evidence and expected evidence hooks.

## Validation / Test Notes
- template contract tests, family-specific acceptance tests, offline execution smoke tests for each family.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
