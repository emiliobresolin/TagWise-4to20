# Story 3.3: Pressure, Temperature/RTD, and Level Transmitter Template Pack

Status: review

## Metadata
- Story key: 3-3-pressure-temperature-rtd-and-level-transmitter-template-pack
- Story map ID: E3-S3
- Epic: Epic 3 - Template-Driven Field Execution
- Release phase: Vertical Slice

## User Story
As a technician, I want the core transmitter templates available in the shared shell so I can perform the approved v1 test patterns on common field instruments.

## Scope
pressure transmitter templates, temperature/RTD input templates, level transmitter templates, their approved test patterns, evidence expectations, and acceptance semantics.

## Key Functional Requirements Covered
FR-04, FR-08 baseline, `Initial V1 Instrument Family / Template Scope`.

## Technical Notes / Implementation Approach
implement only the approved v1 templates and acceptance styles from the PRD; reuse common transmitter input components where possible.

## Dependencies
- `E3-S1`, `E3-S2`.

## Risks
- trying to over-generalize beyond the approved v1 set will delay the first usable slice.

## Acceptance Criteria
1. Pressure transmitter templates support approved v1 test patterns from the PRD.
2. Temperature/RTD templates support approved v1 test patterns from the PRD.
3. Level transmitter templates support approved v1 test patterns from the PRD.
4. Each template declares minimum submission evidence and expected evidence hooks.

## Validation / Test Notes
- template contract tests, family-specific acceptance tests, offline execution smoke tests for each family.

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
- Expanded the local work-package template contract so templates can declare capture summary, capture fields, minimum submission evidence, and expected evidence hooks without introducing a backend runtime dependency.
- Added the approved v1 pressure, temperature/RTD, and level transmitter template patterns to the seeded local package data, while keeping the existing shared shell and deterministic engine entry path intact.
- Updated local tag context to expose multiple approved execution templates for a selected tag, and updated the mobile shell so the technician chooses the local transmitter pattern before opening the shared execution shell.
- Changed the shared execution shell to load an exact selected template instead of implicitly taking the first template attached to a tag, preserving one execution-entry flow while supporting multiple family patterns over time.
- Kept the deterministic calculation engine pure and isolated, but allowed template-provided capture labels to flow into the calculation definition so family-specific execution wording stays template-driven rather than screen-driven.
- Added contract tests for the approved v1 transmitter patterns and offline shared-shell smoke coverage for pressure, temperature/RTD, and level family flows.
- Kept Story 3.3 narrow: no report flow, no checklist workflow, no sync logic, no approval flow, no AI/diagnosis, and no live backend lookup were introduced.
- Hardened the QA-fix path so multi-template tags never auto-select a template: tag context now starts with no execution template selected, there is no silent first-template fallback, and the shared-shell proceed action stays disabled until the technician makes an explicit local choice.
- Added a focused regression test for the explicit-selection rule so multi-template tags cannot proceed into the shared shell without a deliberate technician selection.

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
- `mobile/src/features/work-packages/model.ts`
- `mobile/src/features/work-packages/localTagContextService.ts`
- `mobile/src/features/work-packages/localTagContextService.test.ts`
- `mobile/src/features/work-packages/assignedWorkPackageCatalogService.test.ts`
- `mobile/src/features/execution/model.ts`
- `mobile/src/features/execution/deterministicCalculationEngine.ts`
- `mobile/src/features/execution/executionTemplateSelection.ts`
- `mobile/src/features/execution/executionTemplateSelection.test.ts`
- `mobile/src/features/execution/localExecutionTemplateRegistry.ts`
- `mobile/src/features/execution/localExecutionTemplateRegistry.test.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/execution/sharedExecutionShellService.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `_bmad-output/implementation-artifacts/3-3-pressure-temperature-rtd-and-level-transmitter-template-pack.md`
