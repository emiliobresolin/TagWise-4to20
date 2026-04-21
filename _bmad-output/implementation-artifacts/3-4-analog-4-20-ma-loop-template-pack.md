# Story 3.4: Analog 4-20 mA Loop Template Pack

Status: review

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

## Dev Agent Record

### Agent Model Used
GPT-5 Codex

### Completion Notes List
- Extended the approved local template contract so analog loop templates can declare conversion basis summaries, expected range summaries, and an explicit calculation-range override while still reusing the shared shell and deterministic engine.
- Added the approved v1 analog `4-20 mA` loop patterns to the seeded local package snapshot data: loop integrity check, signal validation, and expected current versus process value verification.
- Kept execution template-driven by carrying loop-specific `mA` capture units and signal-span calculation range in template data rather than introducing a loop-specific screen or backend runtime dependency.
- Updated the shared execution shell to surface loop conversion basis and expected range inside the calculation step, and persisted that execution context with the local calculation record so restart/resume keeps the same loop basis visible.
- Kept Story 3.4 narrow: no report flow, no checklist workflow expansion, no sync logic, no approval flow, no AI/diagnosis, and no live backend lookup were introduced.

### Tests Run
- `cd mobile && npm test`
- `cd mobile && npm run typecheck`
- `cd mobile && npx expo export --platform android`
- `cd backend && npm test`
- `cd backend && npm run typecheck`
- `cd backend && npm run build`

### File List
- `backend/src/modules/work-packages/model.ts`
- `backend/src/modules/work-packages/seedData.ts`
- `backend/dist/modules/work-packages/seedData.js`
- `mobile/src/features/work-packages/model.ts`
- `mobile/src/features/execution/model.ts`
- `mobile/src/features/execution/deterministicCalculationEngine.ts`
- `mobile/src/features/execution/deterministicCalculationEngine.test.ts`
- `mobile/src/features/execution/localExecutionTemplateRegistry.ts`
- `mobile/src/features/execution/localExecutionTemplateRegistry.test.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/execution/sharedExecutionShellService.test.ts`
- `mobile/src/data/local/sqlite/migrations.ts`
- `mobile/src/data/local/sqlite/bootstrap.test.ts`
- `mobile/src/data/local/repositories/userPartitionedExecutionCalculationRepository.ts`
- `mobile/src/data/local/repositories/userPartitionedLocalStoreFactory.test.ts`
- `_bmad-output/implementation-artifacts/3-4-analog-4-20-ma-loop-template-pack.md`
