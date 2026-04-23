# Story 4.1: Structured Execution Evidence Capture

Status: review

## Metadata
- Story key: 4-1-structured-execution-evidence-capture
- Story map ID: E4-S1
- Epic: Epic 4 - Evidence, Justification, and Per-Tag Report Drafting
- Release phase: Vertical Slice

## User Story
As a technician, I want readings, observations, and checklist outcomes captured in the flow so reports are built from real work instead of later re-entry.

## Scope
structured readings capture, free-text notes, checklist result capture, evidence linkage to execution steps and tag/report context.

## Key Functional Requirements Covered
FR-08, FR-09 enablement, Domain object `Evidence Item`.

## Technical Notes / Implementation Approach
store evidence metadata in SQLite linked to tag, step, and draft report ids; support edits while the report remains technician-owned.

## Dependencies
- `E3-S1`, `E3-S2`, `E3-S7`.

## Risks
- weak linkage between steps and evidence will complicate report generation and sync.

## Acceptance Criteria
1. Technician can capture structured evidence during execution without leaving the tag flow.
2. Evidence metadata is linked to tag, execution step, and draft report.
3. Evidence remains editable while the report is still in technician-owned draft state.
4. Structured evidence survives app restart.

## Validation / Test Notes
- local evidence persistence tests, step-linkage tests, draft editing tests.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)

## Dev Agent Record

### Agent Model Used
GPT-5 Codex

### Completion Notes List
- Added a dedicated local `user_partitioned_execution_evidence` store so structured readings, free-text notes, and checklist outcomes can be linked to tag, execution step, and draft report without introducing backend/runtime coupling.
- Kept the shared shell generic: deterministic calculation save now also snapshots structured readings evidence for the `calculation` step, while a new guidance-evidence save path persists notes and checklist outcomes for the `guidance` step.
- Added a lightweight per-tag draft-report anchor using the existing local draft repository so every captured evidence item now links to a stable technician-owned draft report id without starting full report generation early.
- Preserved non-blocking execution and existing Epic 3 behavior: checklist and note editing remain local-first, restart-safe, and editable while the linked report stays in technician-owned draft state.

### Tests Run
- `cd mobile && npm run typecheck`
- `cd mobile && npm test -- sharedExecutionShellService bootstrap userPartitionedLocalStoreFactory`
- `cd mobile && npm test`
- `cd mobile && npx expo export --platform android`

### File List
- `mobile/src/data/local/repositories/userPartitionedExecutionEvidenceRepository.ts`
- `mobile/src/data/local/repositories/userPartitionedLocalStoreFactory.ts`
- `mobile/src/data/local/repositories/userPartitionedLocalStoreFactory.test.ts`
- `mobile/src/data/local/sqlite/migrations.ts`
- `mobile/src/data/local/sqlite/bootstrap.test.ts`
- `mobile/src/features/execution/model.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/execution/sharedExecutionShellService.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `_bmad-output/implementation-artifacts/4-1-structured-execution-evidence-capture.md`
