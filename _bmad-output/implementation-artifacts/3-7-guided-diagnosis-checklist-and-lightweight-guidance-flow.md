# Story 3.7: Guided Diagnosis, Checklist, and Lightweight Guidance Flow

Status: ready-for-dev

## Metadata
- Story key: 3-7-guided-diagnosis-checklist-and-lightweight-guidance-flow
- Story map ID: E3-S7
- Epic: Epic 3 - Template-Driven Field Execution
- Release phase: Vertical Slice

## User Story
As a technician, I want practical next-step guidance and concise checklist context so I can keep moving without opening a manual.

## Scope
guided diagnosis prompts, checklist steps, why-it-matters messaging, source reference display, risk-flag hooks for skipped/incomplete items.

## Key Functional Requirements Covered
FR-06, FR-07.

## Technical Notes / Implementation Approach
keep guidance lightweight and template-linked; support offline baseline prompts; treat any future AI result as additive only.

## Dependencies
- `E3-S1`, `E3-S2`, `E3-S6`.

## Risks
- dumping too much normative content into the shell will hurt field usability.

## Acceptance Criteria
1. Execution shell displays checklist steps and guidance in context.
2. Prompts explain what to do, why it matters, and what it helps rule out.
3. Skipped or incomplete checklist items generate visible risk state hooks.
4. Flow works offline with cached guidance content.

## Validation / Test Notes
- checklist completion tests, skip/incomplete risk tests, UX smoke tests for concise guidance display.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
