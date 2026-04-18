# Story 1.1: Mobile App Shell and SQLite Bootstrap

Status: review

## Metadata
- Story key: 1-1-mobile-app-shell-and-sqlite-bootstrap
- Story map ID: E1-S1
- Epic: Epic 1 - Platform, Identity, and Local-First Foundation
- Release phase: Vertical Slice

## User Story
As a technician, I want the mobile app to open into a reliable local-first shell so field work can continue even when connectivity is poor.

## Scope
mobile navigation shell, app startup flow, SQLite initialization, local migration handling, offline-capable screen placeholders, basic repository wiring.

## Key Functional Requirements Covered
PRD platform baseline, Offline/Sync "must work fully offline", Architecture local-first mobile architecture.

## Technical Notes / Implementation Approach
use the approved mobile-first stack; initialize SQLite on app launch; establish a repository layer that reads local state first; persist app shell state across restart.

## Dependencies
- none.

## Risks
- startup migration failures can strand users; a network-first screen pattern here will create rework later.

## Acceptance Criteria
1. App launches without requiring an active network call to render the signed-out shell.
2. SQLite initializes successfully on first launch and app restart.
3. Local-first repositories can read and write a seeded record without live API dependency.
4. App restart preserves local seeded data and navigation state where appropriate.

## Validation / Test Notes
- mobile smoke tests on iOS/Android simulators, SQLite migration tests, kill-and-restart persistence test.

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
- Bootstrapped a new Expo React Native TypeScript client in `mobile/` as the first concrete `mobile-app` runtime boundary.
- Replaced the default Expo screen with a signed-out local shell that renders without live API calls and exposes two placeholder shell sections: `Foundation` and `Storage`.
- Added an async SQLite adapter, migration runner, bootstrap flow, and two local-first repositories:
- `AppPreferencesRepository` for persisted shell route state
- `BootstrapDemoRepository` for a seeded proof record with persisted launch/manual-write counters
- Added minimal future-safe platform boundaries for secure storage and sandbox file-path ownership without implementing auth or evidence behavior yet.
- Added automated tests for migration/bootstrap idempotence and restart-style persistence by reopening the same SQLite file in tests.
- Applied the QA cleanup fix so a late-resolving SQLite bootstrap closes its database handle if the root component already unmounted.
- Added a narrow unit test around the late-bootstrap cleanup path without changing Story 1.1 scope.
- Added a manual smoke-test path in `mobile/README.md` for simulator/device validation.

### Tests Run
- `npm run typecheck`
- `npm test`
- `npx expo export --platform android`

### Manual Smoke Test
1. Run `cd mobile && npm start`.
2. Open the app on an Android emulator, iOS simulator, or Expo Go.
3. Wait for the loading screen to finish.
4. Confirm the signed-out shell appears without any login or network dependency.
5. Press `Write local record` once on the `Foundation` section.
6. Switch to `Storage`.
7. Fully close and reopen the app.
8. Expected result:
- launch count increments after reopen
- manual write count persists
- the last selected shell section remains selected

### File List
- `mobile/App.tsx`
- `mobile/README.md`
- `mobile/app.json`
- `mobile/package-lock.json`
- `mobile/package.json`
- `mobile/src/data/local/bootstrapLocalDatabase.test.ts`
- `mobile/src/data/local/bootstrapLocalDatabase.ts`
- `mobile/src/data/local/repositories/appPreferencesRepository.ts`
- `mobile/src/data/local/repositories/bootstrapDemoRepository.ts`
- `mobile/src/data/local/sqlite/bootstrap.test.ts`
- `mobile/src/data/local/sqlite/expoSqliteDatabase.ts`
- `mobile/src/data/local/sqlite/migrations.ts`
- `mobile/src/data/local/sqlite/types.ts`
- `mobile/src/features/app-shell/model.ts`
- `mobile/src/platform/files/appSandboxBoundary.ts`
- `mobile/src/platform/secure-storage/secureStorageBoundary.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `mobile/src/shell/runtimeCleanup.test.ts`
- `mobile/src/shell/runtimeCleanup.ts`
- `mobile/tests/helpers/createNodeSqliteDatabase.ts`
- `mobile/vitest.config.ts`
