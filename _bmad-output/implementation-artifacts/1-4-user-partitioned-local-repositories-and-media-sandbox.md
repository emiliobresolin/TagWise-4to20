# Story 1.4: User-Partitioned Local Repositories and Media Sandbox

Status: review

## Metadata
- Story key: 1-4-user-partitioned-local-repositories-and-media-sandbox
- Story map ID: E1-S4
- Epic: Epic 1 - Platform, Identity, and Local-First Foundation
- Release phase: Vertical Slice

## User Story
As a technician, I want my local drafts, evidence, and queued work isolated to my authenticated session so device sharing cannot corrupt report ownership.

## Scope
user-partitioned local tables, user-partitioned media folders, repository identity binding, local cleanup rules.

## Key Functional Requirements Covered
Offline identity/session boundary, FR-08 baseline enablement, Sync lifecycle groundwork.

## Technical Notes / Implementation Approach
key local records by authenticated user plus business object id; isolate sandbox media paths by user/session; never reuse unsynced records across users.

## Dependencies
- `E1-S1`, `E1-S3`.

## Risks
- weak local partitioning will break sync ownership and auditability later.

## Acceptance Criteria
1. Local drafts, evidence metadata, and queued items are stored under the authenticated user partition.
2. Media files captured by one user are not visible in another user's local session.
3. User logout/login does not reassign unsynced content to a different user.
4. Local repositories can query by user and business object identity.

## Validation / Test Notes
- multi-user device simulation, local data isolation test, media path ownership test.

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
- Added user-partitioned local SQLite tables for draft placeholders, evidence metadata placeholders, and queue placeholders keyed by authenticated user plus business object identity.
- Added a user-bound repository factory so later stories can bind local draft, evidence, and queue access to the authenticated user without reassigning ownership.
- Replaced the sandbox placeholder with a real user-owned media boundary that generates isolated evidence paths and can persist local text proof files for the current story baseline.
- Wired a narrow signed-in proof flow into the mobile shell storage route so the current user can create owned local draft/evidence/queue records and a user-owned sandbox file without introducing report or sync features early.
- Preserved the cleanup rule boundary: switching users clears auth/session state only, while unsynced local records remain owned by their original user partition and are not reused by the next signed-in user.

### Tests Run
- `cd mobile && npm test`
- `cd mobile && npm run typecheck`
- `cd mobile && npx expo export --platform android`

### Manual Smoke Test
1. In `backend/`, export the values from `.env.example`, run `npm run db:migrate`, and run `npm run dev:api`.
2. In `mobile/`, set `EXPO_PUBLIC_TAGWISE_API_BASE_URL` if you are not using `http://127.0.0.1:4100`.
3. Run `npm start` and open the app on an emulator, simulator, or Expo Go.
4. Sign in with `tech@tagwise.local` / `TagWise123!`.
5. Open the `Storage` route and tap `Write owned local sample`.
6. Confirm the storage view shows one owned draft, one owned evidence item, one owned queue item, and a media path under `evidence/users/<technician-user-id>/...`.
7. Tap `Switch user`, sign in with `supervisor@tagwise.local` / `TagWise123!`, and return to the `Storage` route.
8. Expected result:
- the supervisor sees `0` owned draft/evidence/queue items before writing their own sample
- the technician-owned media path is not shown in the supervisor session
- the technician partition is not reassigned or merged into the supervisor session

### File List
- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/README.md`
- `mobile/src/data/local/bootstrapLocalDatabase.test.ts`
- `mobile/src/data/local/bootstrapLocalDatabase.ts`
- `mobile/src/data/local/repositories/userPartitionedDraftRepository.ts`
- `mobile/src/data/local/repositories/userPartitionedEvidenceMetadataRepository.ts`
- `mobile/src/data/local/repositories/userPartitionedLocalStoreFactory.test.ts`
- `mobile/src/data/local/repositories/userPartitionedLocalStoreFactory.ts`
- `mobile/src/data/local/repositories/userPartitionedLocalTypes.ts`
- `mobile/src/data/local/repositories/userPartitionedQueueItemRepository.ts`
- `mobile/src/data/local/sqlite/bootstrap.test.ts`
- `mobile/src/data/local/sqlite/migrations.ts`
- `mobile/src/features/app-shell/localOwnershipDemo.ts`
- `mobile/src/features/app-shell/model.ts`
- `mobile/src/platform/files/appSandboxBoundary.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `mobile/tests/helpers/createNodeAppSandboxBoundary.ts`
