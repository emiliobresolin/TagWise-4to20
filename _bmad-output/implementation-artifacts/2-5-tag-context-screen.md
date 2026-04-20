# Story 2.5: Tag Context Screen

Status: review

## Metadata
- Story key: 2-5-tag-context-screen
- Story map ID: E2-S5
- Epic: Epic 2 - Offline Work Package and Tag Access
- Release phase: Vertical Slice

## User Story
As a technician, I want concise tag context on mobile so I can understand what I am working on without digging through desktop-style screens.

## Scope
tag metadata view, range/unit/tolerance display, criticality/due indicators, recent history summary preview, reference pointers, missing-context markers.

## Key Functional Requirements Covered
FR-03, FR-05 preview behavior, Domain object `Tag / Asset Context`.

## Technical Notes / Implementation Approach
render only field-critical context first; visually distinguish missing context from unavailable history; prepare handoff into execution shell.

## Dependencies
- `E2-S1`, `E2-S2`, `E2-S3`.

## Risks
- overloading the screen will increase cognitive switching and slow field work.

## Acceptance Criteria
1. Tag context loads entirely from local storage for downloaded packages.
2. Screen shows the approved minimum field context where available.
3. Missing context is explicitly marked and does not silently disappear.
4. User can proceed from tag context into the execution shell.

## Validation / Test Notes
- mobile UI regression tests, missing-context rendering test, offline load test.

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
- Added a local tag context service that resolves field-critical tag context entirely from downloaded package snapshots in SQLite-backed local storage.
- Extended the `Packages` route so opening a tag now renders a dedicated local tag context view with range/unit/tolerance, criticality, due status, history preview, local reference pointers, and explicit missing-context markers.
- Added a minimal execution-shell handoff stub so technicians can proceed from tag context without prematurely implementing the full shared execution shell from Epic 3.
- Kept the implementation narrow: no live lookup, no report flow, no approval logic, and no sync behavior were introduced.

### Tests Run
- `cd mobile && npm test`
- `cd mobile && npm run typecheck`
- `cd mobile && npx expo export --platform android`

### File List
- `mobile/src/features/work-packages/model.ts`
- `mobile/src/features/work-packages/localTagContextService.ts`
- `mobile/src/features/work-packages/localTagContextService.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `_bmad-output/implementation-artifacts/2-5-tag-context-screen.md`
