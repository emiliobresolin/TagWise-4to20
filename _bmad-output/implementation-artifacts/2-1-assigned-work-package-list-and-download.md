# Story 2.1: Assigned Work Package List and Download

Status: review

## Metadata
- Story key: 2-1-assigned-work-package-list-and-download
- Story map ID: E2-S1
- Epic: Epic 2 - Offline Work Package and Tag Access
- Release phase: Vertical Slice

## User Story
As a technician, I want to see my assigned work packages and download them before entering the field so I can work offline on the right tags.

## Scope
assigned package list API, mobile list UI, package download action, local snapshot persistence for package payloads.

## Key Functional Requirements Covered
FR-01, FR-02, Domain object `Assigned Work Package`.

## Technical Notes / Implementation Approach
download a bounded snapshot containing tags, templates, cached history summary, and lightweight guidance; store version/freshness metadata locally.

## Dependencies
- `E1-S2`, `E1-S3`, `E1-S4`.

## Risks
- downloading unbounded payloads will hurt field performance.

## Acceptance Criteria
1. Connected technician can view assigned packages in scope.
2. Technician can download a package and store its snapshot locally.
3. Downloaded package contains tag, template, guidance, and history-summary data needed for offline work.
4. Download failure surfaces an actionable message without corrupting local data.

## Validation / Test Notes
- API contract test, package download integration test, offline reopen after download.

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
- Added authenticated backend list and download endpoints for assigned work packages, using PostgreSQL-backed seeded package summaries plus bounded snapshot payloads shaped for offline preload.
- Extended the backend auth foundation with access-token verification for protected technician package endpoints without expanding into broader approval or sync logic.
- Added user-partitioned SQLite storage for assigned package summaries and downloaded snapshots so local package data remains tied to the authenticated user.
- Added a mobile package catalog service and `Packages` route that can refresh while connected, download snapshots, and still render cached packages after offline reopen.
- Kept this story narrow: no package freshness state machine, no tag context screen, no QR entry, and no execution/report flow were implemented here.

### Tests Run
- `cd backend && npm test`
- `cd backend && npm run typecheck`
- `cd backend && npm run build`
- `cd mobile && npm test`
- `cd mobile && npm run typecheck`
- `cd mobile && npx expo export --platform android`

### Manual Smoke Test
1. In `backend/`, export the values from `.env.example`, run `npm run db:migrate`, and start the API with `npm run dev:api`.
2. In `mobile/`, set `EXPO_PUBLIC_TAGWISE_API_BASE_URL` if you are not using `http://127.0.0.1:4100`, then run `npm start`.
3. Sign in with `tech@tagwise.local` / `TagWise123!`.
4. Open the `Packages` route and tap `Refresh assigned packages`.
5. Expected connected result:
- at least one assigned package appears
- each package card shows package id, priority, tag count, and due window
6. Tap `Download snapshot` on one package.
7. Expected local result:
- the package shows a populated `Downloaded` timestamp
- the package remains listed after closing and reopening the app
8. Stop the backend API, reopen the app into the same cached session, and return to `Packages`.
9. Expected offline result:
- the downloaded package still appears from local SQLite
- refresh and download actions remain unavailable until the app reconnects

### File List
- `backend/README.md`
- `backend/src/api/createApiRequestHandler.test.ts`
- `backend/src/api/createApiRequestHandler.ts`
- `backend/src/api/main.ts`
- `backend/src/modules/auth/authService.ts`
- `backend/src/modules/auth/tokenCodec.ts`
- `backend/src/modules/work-packages/assignedWorkPackageRepository.ts`
- `backend/src/modules/work-packages/assignedWorkPackageService.ts`
- `backend/src/modules/work-packages/model.ts`
- `backend/src/modules/work-packages/seedData.ts`
- `backend/src/platform/db/migrations.test.ts`
- `backend/src/platform/db/migrations.ts`
- `mobile/README.md`
- `mobile/src/data/local/repositories/assignedWorkPackageRepository.ts`
- `mobile/src/data/local/repositories/mobileRuntimeErrorRepository.ts`
- `mobile/src/data/local/repositories/userPartitionedLocalStoreFactory.test.ts`
- `mobile/src/data/local/repositories/userPartitionedLocalStoreFactory.ts`
- `mobile/src/data/local/sqlite/bootstrap.test.ts`
- `mobile/src/data/local/sqlite/migrations.ts`
- `mobile/src/features/app-shell/model.ts`
- `mobile/src/features/work-packages/assignedWorkPackageCatalogService.test.ts`
- `mobile/src/features/work-packages/assignedWorkPackageCatalogService.ts`
- `mobile/src/features/work-packages/model.ts`
- `mobile/src/features/work-packages/workPackageApiClient.ts`
- `mobile/src/shell/TagWiseApp.tsx`
