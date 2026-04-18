# Story 3.4: Analog 4-20 mA Loop Template Pack

Status: ready-for-dev

## Metadata
- Story key: 3-4-analog-4-20-ma-loop-template-pack
- Story map ID: E3-S4
- Epic: Epic 3 - Template-Driven Field Execution
- Release phase: First Release

## User Story
As a technician, I want analog loop templates available so I can perform loop integrity and signal validation inside the same execution model.

## Scope
analog 4-20 mA loop integrity templates, signal validation templates, expected current/value conversion basis, related evidence and checklist hooks.

## Key Functional Requirements Covered
FR-04, FR-08 baseline, `Initial V1 Instrument Family / Template Scope`.

## Technical Notes / Implementation Approach
support the approved v1 loop test patterns only; reuse common analog conversion and tolerance components from the calculation engine.

## Dependencies
- `E3-S1`, `E3-S2`.

## Risks
- mixing loop-level and transmitter-level semantics carelessly can blur report meaning.

## Acceptance Criteria
1. Loop templates support the approved v1 test patterns from the PRD.
2. Conversion basis and expected range are captured with the execution record.
3. Loop deviation and tolerance outcomes are visible in the execution shell.
4. Template data remains compatible with shared report and sync models.

## Validation / Test Notes
- conversion tests, loop template contract tests, offline loop execution test.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
