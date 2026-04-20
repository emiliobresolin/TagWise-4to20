# Story 2.2: Offline Readiness and Package Freshness States

Status: review

## Metadata
- Story key: 2-2-offline-readiness-and-package-freshness-states
- Story map ID: E2-S2
- Epic: Epic 2 - Offline Work Package and Tag Access
- Release phase: End-to-End Demo

## User Story
As a technician, I want to know whether a downloaded package is complete and current enough for field use so I can trust it before I leave connectivity.

## Scope
readiness indicators, freshness timestamp display, refresh action, stale/unknown freshness state handling.

## Key Functional Requirements Covered
FR-01, FR-05 freshness behavior, Offline/Sync visibility requirements.

## Technical Notes / Implementation Approach
compute readiness from local snapshot completeness; store refresh metadata and any upstream freshness indicator; display "age unknown" when needed.

## Dependencies
- `E2-S1`.

## Risks
- vague readiness language will reduce technician trust.

## Acceptance Criteria
1. Downloaded packages show a clear offline-ready, incomplete, stale, or age-unknown state.
2. Users can refresh a package while connected.
3. Refresh updates stored freshness metadata without losing local drafts.
4. Freshness states are visible before a user opens tag work.

## Validation / Test Notes
- UI state tests, refresh regression test, stale/unknown state acceptance test.

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
- Added package readiness evaluation with four technician-visible states: `Offline ready`, `Incomplete`, `Stale`, and `Age unknown`.
- Persisted snapshot freshness metadata locally by storing the upstream snapshot generation timestamp alongside the existing local download timestamp.
- Updated the `Packages` route to show readiness, refresh/source freshness timestamps, and a connected-only `Refresh snapshot` action for already downloaded packages.
- Preserved local-first behavior and kept this story narrow: no tag context, execution flow, sync behavior, or approval behavior was added.
- Grounded story decision: because the approved artifacts did not define a numeric stale threshold, v1 treats package snapshots refreshed more than `24` hours ago as `Stale`, with the threshold encapsulated in one helper constant for later adjustment if product rules change.
- QA correction applied: readiness now treats upstream snapshot freshness as authoritative, so a recently downloaded package with stale upstream data is still marked `Stale`.

### Tests Run
- `cd mobile && npm test`
- `cd mobile && npm run typecheck`
- `cd mobile && npx expo export --platform android`

### File List
- `mobile/src/data/local/repositories/assignedWorkPackageRepository.ts`
- `mobile/src/data/local/sqlite/bootstrap.test.ts`
- `mobile/src/data/local/sqlite/migrations.ts`
- `mobile/src/features/work-packages/assignedWorkPackageCatalogService.test.ts`
- `mobile/src/features/work-packages/assignedWorkPackageReadiness.test.ts`
- `mobile/src/features/work-packages/assignedWorkPackageReadiness.ts`
- `mobile/src/features/work-packages/model.ts`
- `mobile/src/shell/TagWiseApp.tsx`
