# Story 3.5: Control Valve With Positioner Template Pack

Status: ready-for-dev

## Metadata
- Story key: 3-5-control-valve-with-positioner-template-pack
- Story map ID: E3-S5
- Epic: Epic 3 - Template-Driven Field Execution
- Release phase: First Release

## User Story
As a technician, I want control valve and positioner templates available so I can perform the approved v1 movement and feedback checks inside TagWise.

## Scope
stroke test template, position feedback verification template, movement checkpoints, evidence expectations, safety-aware checklist hooks.

## Key Functional Requirements Covered
FR-04, FR-08 baseline, `Initial V1 Instrument Family / Template Scope`.

## Technical Notes / Implementation Approach
keep v1 to commanded-versus-observed checks and approved checklist prompts; do not add advanced valve analytics.

## Dependencies
- `E3-S1`, `E3-S2`.

## Risks
- valve-specific requests can balloon into diagnostics outside the v1 boundary.

## Acceptance Criteria
1. Control valve templates support stroke and position feedback checks defined in the PRD.
2. Templates capture commanded points and observed responses.
3. Template configuration remains compatible with the shared execution shell and calculation engine.
4. Safety-aware checklist prompts are available in-flow.

## Validation / Test Notes
- valve template contract tests, checkpoint acceptance tests, offline shell test.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
