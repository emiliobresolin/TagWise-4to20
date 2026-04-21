# Story 3.2: Deterministic Calculation and Acceptance Engine

Status: review

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

## Dev Agent Record

### Agent Model Used
GPT-5 Codex

### Completion Notes List
- Added a deterministic calculation rules layer separate from the UI, including local tolerance parsing, signed and absolute deviation, percent-of-span calculation, and pass/fail or unavailable acceptance classification.
- Added user-partitioned SQLite persistence for raw calculation inputs and derived results so saved calculations survive restart-like reopen cycles.
- Extended the shared execution shell to load persisted calculation state and to save deterministic calculation outputs locally from the calculation step without introducing family-specific forms.
- Hardened persisted calculation loading so stored results are only reused when the saved `templateVersion` matches the current local template contract version; stale calculations are treated as fresh state after a package/template refresh.
- Corrected absolute-tolerance parsing so numeric engineering-unit tolerances do not depend on span, and kept the free-text calculation-mode label mapping isolated inside the calculation engine for later template-pack replacement.
- Added regression coverage for deterministic repeat runs, non-numeric tolerance handling, and template-version mismatch after local package refresh.
- Added a legacy v8-to-v9 migration regression that proves populated execution-calculation rows survive the copy/drop/rename rebuild without loss, and verified the rebuilt schema accepts multiple versions for the same template identity.
- Added an explicit unknown `calculationMode` fallback assertion so unsupported modes keep deterministic generic labels instead of producing implicit or unsafe UI behavior.
- Kept Story 3.2 narrow: no evidence capture, no report flow, no sync logic, no approval behavior, and no backend contract changes were introduced.

### Tests Run
- `cd mobile && npm test`
- `cd mobile && npm run typecheck`
- `cd mobile && npx expo export --platform android`

### File List
- `mobile/src/features/execution/model.ts`
- `mobile/src/features/execution/deterministicCalculationEngine.ts`
- `mobile/src/features/execution/deterministicCalculationEngine.test.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/execution/sharedExecutionShellService.test.ts`
- `mobile/src/data/local/repositories/userPartitionedExecutionCalculationRepository.ts`
- `mobile/src/data/local/repositories/userPartitionedLocalStoreFactory.ts`
- `mobile/src/data/local/repositories/userPartitionedLocalStoreFactory.test.ts`
- `mobile/src/data/local/sqlite/migrations.ts`
- `mobile/src/data/local/sqlite/bootstrap.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `_bmad-output/implementation-artifacts/3-2-deterministic-calculation-and-acceptance-engine.md`
