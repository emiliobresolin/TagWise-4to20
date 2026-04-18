# Story 3.2: Deterministic Calculation and Acceptance Engine

Status: ready-for-dev

## Metadata
- Story key: 3-2-deterministic-calculation-and-acceptance-engine
- Story map ID: E3-S2
- Epic: Epic 3 - Template-Driven Field Execution
- Release phase: Vertical Slice

## User Story
As a technician, I want calculation and acceptance results to be deterministic and local so I can trust the app when no network is available.

## Scope
calculation engine for raw input capture, deviation/error calculation, tolerance/pass-fail classification, persistence of raw and calculated values.

## Key Functional Requirements Covered
FR-04, FR-09 input enablement.

## Technical Notes / Implementation Approach
implement a deterministic rules layer separate from UI; preserve both raw inputs and derived outputs in the execution record.

## Dependencies
- `E3-S1`.

## Risks
- embedding formulas directly in screens will make template growth and test coverage difficult.

## Acceptance Criteria
1. Engine computes deterministic outputs for supported template inputs offline.
2. Raw observations and calculated results are both stored locally.
3. Acceptance classification is reproducible for the same inputs.
4. Calculation results survive app restart and resume.

## Validation / Test Notes
- formula unit tests, persistence tests, deterministic repeat-run tests.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
