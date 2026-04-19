# TagWise Mobile

Story 1.1 bootstraps the mobile shell, local SQLite database, migration runner, and a minimal local-first repository proof path.

Story 1.3 adds connected authentication, secure token storage, offline session restore, and cached role metadata.

Story 1.4 adds user-partitioned local draft, evidence metadata, and queue placeholders plus a user-owned sandbox media path baseline.

## Commands
- `npm start`
- `npm run android`
- `npm run ios`
- `npm test`
- `npm run typecheck`

Optional environment:
- `EXPO_PUBLIC_TAGWISE_API_BASE_URL=http://127.0.0.1:4100`

## Manual Smoke Test
1. Run `npm start`.
2. Open the app on an Android emulator, iOS simulator, or Expo Go.
3. Wait for the loading view to finish. Expected result: the app opens into the connected sign-in screen when no cached session exists.
4. Sign in with a seeded backend user such as `tech@tagwise.local` / `TagWise123!`.
5. Expected result after sign-in:
- the signed-in shell appears
- the role and session mode render in the shell
- the local proof record still updates on the `Foundation` route
6. Open the `Storage` route and tap `Write owned local sample`.
7. Expected result after the owned local sample write:
- the shell shows `Owned drafts = 1`, `Owned evidence = 1`, and `Owned queue = 1`
- the latest owned media path includes the signed-in user partition
8. Tap `Switch user`, sign in as a different seeded account such as `supervisor@tagwise.local` / `TagWise123!`, and return to the `Storage` route.
9. Expected result after the user switch:
- the second user starts with `Owned drafts = 0`, `Owned evidence = 0`, and `Owned queue = 0`
- the first user's local partition is not shown or reassigned
10. Fully close the app, stop the backend API, and reopen the app.
11. Expected result after offline reopen:
- the app restores the same cached user session
- session mode shows `offline`
- review actions remain unavailable from the cached offline session
