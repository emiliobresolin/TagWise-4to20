# Story 4.3: Justification Triggers and Non-Blocking Risk UX

Status: review

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

## Dev Agent Record

### Agent Model Used
GPT-5 Codex

### Completion Notes List
- Added a deterministic local risk layer to the shared execution shell so visible risk now comes from missing history, missing context, skipped or incomplete checklist items, missing expected evidence, and missing minimum submission evidence without introducing a new workflow engine.
- Kept warn-versus-block explicit: expected-evidence and context/history/checklist gaps stay visible warnings, while minimum-evidence gaps and any missing required justifications surface as submit-blocking hooks only.
- Persisted risk justifications inside the existing execution-evidence store for the guidance step, so they survive reopen/restart and stay linked to the same tag, template version, and technician-owned draft report context from Story 4.1.
- Preserved non-blocking field flow by keeping risk and justification edits local to the current shell, and by reusing the existing reload-and-merge pattern so calculation inputs, notes, checklist outcomes, and photo evidence keep working together.
- Replaced the Story 4.3 evidence-readiness shortcut with explicit evidence-kind mapping for approved v1 labels, so saved readings no longer clear observation-style requirements and unmapped labels no longer collapse into generic calculation satisfaction.

### Tests Run
- `cd mobile && npm run typecheck`
- `cd mobile && npm test -- sharedExecutionShellService bootstrap userPartitionedLocalStoreFactory`
- `cd mobile && npm test`
- `cd mobile && npx expo export --platform android`

### File List
- `mobile/src/data/local/repositories/userPartitionedExecutionEvidenceRepository.ts`
- `mobile/src/data/local/repositories/userPartitionedLocalStoreFactory.test.ts`
- `mobile/src/data/local/sqlite/bootstrap.test.ts`
- `mobile/src/data/local/sqlite/migrations.ts`
- `mobile/src/features/execution/model.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/execution/sharedExecutionShellService.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `_bmad-output/implementation-artifacts/4-3-justification-triggers-and-non-blocking-risk-ux.md`
