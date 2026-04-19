# Story 1.3: Connected Authentication, Offline Session Continuity, and Role Cache

Status: review

## Metadata
- Story key: 1-3-connected-authentication-offline-session-continuity-and-role-cache
- Story map ID: E1-S3
- Epic: Epic 1 - Platform, Identity, and Local-First Foundation
- Release phase: Vertical Slice

## User Story
As a technician, supervisor, or manager, I want to sign in while connected and keep a valid role-scoped session offline so I can use the product according to my responsibilities.

## Scope
connected login, token handling, secure local credential storage, offline session restore, role cache, one active user per device session.

## Key Functional Requirements Covered
Approval/RBAC requirements, Offline identity/session boundary, Architecture identity architecture.

## Technical Notes / Implementation Approach
store tokens in platform secure storage; cache user/role metadata separately from authoritative online review permissions; block offline user switching when unsynced work exists.

## Dependencies
- `E1-S1`, `E1-S2`.

## Risks
- role leakage across sessions; offline expiry handling can become confusing if not made explicit.

## Acceptance Criteria
1. Connected users can authenticate and reopen the app offline in the same session.
2. Role metadata is cached locally for technician experience and routing decisions.
3. Offline user switching is blocked when unsynced local work exists.
4. Review actions remain unavailable offline even if role metadata is cached.

## Validation / Test Notes
- auth integration tests, secure storage tests, offline reopen scenario, role-based access tests for connected and offline states.

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
- Added a backend-owned authentication slice to the existing modular monolith with seeded bootstrap users, connected login, refresh-token handling, and API routes on the same API runtime.
- Extended the PostgreSQL migration baseline with an `auth_users` table and kept role assignments server-side.
- Implemented secure mobile token storage with `expo-secure-store` and cached user/role metadata separately in SQLite.
- Added a mobile session controller that restores cached sessions offline, refreshes them when the backend is reachable, and clears invalid sessions on connected auth failure.
- Kept one active user per device session and blocked offline user switching when local unsynced work is present in the local guard repository.
- Updated the mobile shell to support connected sign-in, offline reopen, role-aware session display, and explicit offline disabling of review actions.
- Kept this story narrow: no report flow, sync queue, approval actions, work-package preload, or media workflows were implemented.

### Tests Run
- `cd mobile && npm test`
- `cd mobile && npm run typecheck`
- `cd mobile && npx expo export --platform android`
- `cd backend && npm test`
- `cd backend && npm run typecheck`
- `cd backend && npm run build`

### Manual Smoke Test
1. In `backend/`, export the values from `.env.example`.
2. Run `npm run db:migrate`.
3. Run `npm run dev:api`.
4. In `mobile/`, set `EXPO_PUBLIC_TAGWISE_API_BASE_URL` to the API base URL if you are not using the default `http://127.0.0.1:4100`.
5. Run `npm start` and open the app on an emulator, simulator, or Expo Go.
6. Sign in with one of the seeded users:
- `tech@tagwise.local` / `TagWise123!`
- `supervisor@tagwise.local` / `TagWise123!`
- `manager@tagwise.local` / `TagWise123!`
7. Confirm the signed-in shell appears and shows the cached role plus session mode `connected`.
8. Stop the API process, fully close the mobile app, and reopen it.
9. Expected result:
- the app reopens into the same cached user session
- session mode changes to `offline`
- review actions show as unavailable from the cached offline session

### File List
- `backend/.env.example`
- `backend/README.md`
- `backend/src/api/createApiRequestHandler.test.ts`
- `backend/src/api/createApiRequestHandler.ts`
- `backend/src/api/main.ts`
- `backend/src/config/env.test.ts`
- `backend/src/config/env.ts`
- `backend/src/modules/auth/authRepository.ts`
- `backend/src/modules/auth/authService.test.ts`
- `backend/src/modules/auth/authService.ts`
- `backend/src/modules/auth/model.ts`
- `backend/src/modules/auth/passwordCodec.ts`
- `backend/src/modules/auth/tokenCodec.ts`
- `backend/src/platform/db/migrations.test.ts`
- `backend/src/platform/db/migrations.ts`
- `backend/src/platform/health/httpHealthServer.ts`
- `backend/src/runtime/serviceRuntime.ts`
- `mobile/README.md`
- `mobile/app.json`
- `mobile/package-lock.json`
- `mobile/package.json`
- `mobile/src/data/local/bootstrapLocalDatabase.ts`
- `mobile/src/data/local/repositories/authSessionCacheRepository.ts`
- `mobile/src/data/local/repositories/localWorkStateRepository.ts`
- `mobile/src/data/local/sqlite/bootstrap.test.ts`
- `mobile/src/data/local/sqlite/migrations.ts`
- `mobile/src/features/auth/authApiClient.ts`
- `mobile/src/features/auth/model.ts`
- `mobile/src/features/auth/sessionController.test.ts`
- `mobile/src/features/auth/sessionController.ts`
- `mobile/src/platform/secure-storage/secureStorageBoundary.ts`
- `mobile/src/shell/TagWiseApp.tsx`
