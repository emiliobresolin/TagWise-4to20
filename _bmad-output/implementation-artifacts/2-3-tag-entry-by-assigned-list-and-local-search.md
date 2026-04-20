# Story 2.3: Tag Entry by Assigned List and Local Search

Status: review

## Metadata
- Story key: 2-3-tag-entry-by-assigned-list-and-local-search
- Story map ID: E2-S3
- Epic: Epic 2 - Offline Work Package and Tag Access
- Release phase: Vertical Slice

## User Story
As a technician, I want to open a tag from the assigned list or by local search so I can start work quickly at the asset.

## Scope
tag list within package, local search/filter, open-tag action, tag identity confirmation.

## Key Functional Requirements Covered
FR-02.

## Technical Notes / Implementation Approach
search must operate entirely on local package scope; preserve tag as the primary object even when entered from a package.

## Dependencies
- `E2-S1`.

## Risks
- mixing package and tag identity can confuse later report ownership.

## Acceptance Criteria
1. Technician can browse tags inside a downloaded package.
2. Technician can search local tags by identifier or short description without a live API call.
3. Opening a result lands on the selected tag, not a generic package page.
4. Search results never imply access to uncached tags outside the local scope.

## Validation / Test Notes
- local search tests, offline navigation tests, tag identity selection test.

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
- Added a local tag entry service that reads only downloaded package snapshots from SQLite-backed local storage and exposes package-scoped tag browse/search/select behavior.
- Extended the `Packages` route so technicians can browse cached tags inside a downloaded package, search by tag code or short description entirely offline, and open a selected tag identity without leaving local scope.
- Kept this story intentionally narrow: no QR handling, no full tag context screen, no execution flow, and no live API dependency were added.
- Grounded implementation choice: opening a tag now lands on a selected-tag identity panel that confirms the tag as the operational anchor, while the later dedicated tag-context story remains separate.

### Tests Run
- `cd mobile && npm test`
- `cd mobile && npm run typecheck`
- `cd mobile && npx expo export --platform android`

### File List
- `mobile/src/features/work-packages/localTagEntryService.ts`
- `mobile/src/features/work-packages/localTagEntryService.test.ts`
- `mobile/src/features/work-packages/model.ts`
- `mobile/src/shell/TagWiseApp.tsx`
