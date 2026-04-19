# TagWise Mobile

Story 1.1 bootstraps the mobile shell, local SQLite database, migration runner, and a minimal local-first repository proof path.

Story 1.3 adds connected authentication, secure token storage, offline session restore, and cached role metadata.

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
6. Fully close the app, stop the backend API, and reopen the app.
7. Expected result after offline reopen:
- the app restores the same cached user session
- session mode shows `offline`
- review actions remain unavailable from the cached offline session
