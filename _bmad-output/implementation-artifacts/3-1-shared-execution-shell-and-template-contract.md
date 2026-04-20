# Story 3.1: Shared Execution Shell and Template Contract

Status: review

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

## Dev Agent Record

### Agent Model Used
GPT-5 Codex

### Completion Notes List
- Added a shared local execution-shell contract and template registry that resolve template identity, family, test pattern, and ordered shell steps directly from downloaded package snapshots.
- Added user-partitioned execution-progress persistence in SQLite so the current execution step and visited steps survive restart-like reopen cycles without any remote dependency.
- Replaced the old tag-context handoff stub with a real shared execution shell that reuses the selected-tag path from Epic 2 and supports ordered offline step navigation across context, calculation setup, history comparison, and checklist/guidance.
- Kept Story 3.1 narrow: no calculation engine, no family-specific forms, no evidence/report flow, and no sync or approval behavior were introduced.

### Tests Run
- `cd mobile && npm test`
- `cd mobile && npm run typecheck`
- `cd mobile && npx expo export --platform android`
- `cd backend && npm test`
- `cd backend && npm run typecheck`
- `cd backend && npm run build`

### File List
- `mobile/src/features/execution/model.ts`
- `mobile/src/features/execution/localExecutionTemplateRegistry.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/execution/sharedExecutionShellService.test.ts`
- `mobile/src/data/local/repositories/userPartitionedExecutionProgressRepository.ts`
- `mobile/src/data/local/repositories/userPartitionedLocalStoreFactory.ts`
- `mobile/src/data/local/repositories/userPartitionedLocalStoreFactory.test.ts`
- `mobile/src/data/local/sqlite/migrations.ts`
- `mobile/src/data/local/sqlite/bootstrap.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `_bmad-output/implementation-artifacts/3-1-shared-execution-shell-and-template-contract.md`
