# Story 4.3: Justification Triggers and Non-Blocking Risk UX

Status: ready-for-dev

## Metadata
- Story key: 4-3-justification-triggers-and-non-blocking-risk-ux
- Story map ID: E4-S3
- Epic: Epic 4 - Evidence, Justification, and Per-Tag Report Drafting
- Release phase: Vertical Slice

## User Story
As a technician, I want the app to warn me about missing or weak information without dead-ending my work so I can continue responsibly in messy field conditions.

## Scope
risk flag generation, mandatory justification prompts for visible risk conditions, minimum-versus-expected evidence distinction, submit-blocking rule hooks for missing minimum evidence or missing required justification.

## Key Functional Requirements Covered
FR-07, FR-08, FR-10, Non-blocking behavior section.

## Technical Notes / Implementation Approach
implement deterministic rule hooks from template and workflow state; separate "warn" from "submit-block" explicitly.

## Dependencies
- `E3-S7`, `E4-S1`, `E4-S2`.

## Risks
- if warning and blocking rules are blurred, technicians and reviewers will both lose trust.

## Acceptance Criteria
1. Missing history, skipped checklist items, weak expected evidence, and missing context create visible risk state.
2. Visible risks require justification capture where the PRD says they must.
3. Missing expected evidence alone does not block draft completion.
4. Missing minimum submission evidence or missing required justification can be surfaced as submit-blocking conditions.

## Validation / Test Notes
- rule-engine tests for warn-versus-block behavior, justification UX tests, edge-case tests for partial evidence.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
