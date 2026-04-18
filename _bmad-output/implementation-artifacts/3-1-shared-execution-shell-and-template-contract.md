# Story 3.1: Shared Execution Shell and Template Contract

Status: ready-for-dev

## Metadata
- Story key: 3-1-shared-execution-shell-and-template-contract
- Story map ID: E3-S1
- Epic: Epic 3 - Template-Driven Field Execution
- Release phase: Vertical Slice

## User Story
As a technician, I want one consistent execution flow across supported instruments so I can learn the product once and trust it in the field.

## Scope
shared step shell, local template registry, template-to-UI binding, progress persistence, step navigation from context through checklist/guidance.

## Key Functional Requirements Covered
FR-04, FR-06, FR-07, Domain objects `Instrument Family`, `Test Pattern`, `Procedure / Checklist Reference`.

## Technical Notes / Implementation Approach
use a data-driven template contract that can render family/test-pattern variations inside one shell; persist in-progress step state locally.

## Dependencies
- `E2-S5`.

## Risks
- hard-coded family screens will create rework and break the approved modularity goal.

## Acceptance Criteria
1. Execution shell can load and render a template from local package data.
2. Shell supports ordered navigation across execution steps while preserving local progress.
3. Template version and family/test-pattern identity remain visible to the system.
4. Shell works offline without fetching remote configuration.

## Validation / Test Notes
- template rendering tests, local progress persistence test, offline execution smoke test.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
