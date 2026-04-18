# TagWise Mobile

Story 1.1 bootstraps the mobile shell, local SQLite database, migration runner, and a minimal local-first repository proof path.

## Commands
- `npm start`
- `npm run android`
- `npm run ios`
- `npm test`
- `npm run typecheck`

## Manual Smoke Test
1. Run `npm start`.
2. Open the app on an Android emulator, iOS simulator, or Expo Go.
3. Wait for the loading view to finish. Expected result: the app opens without requiring a live API call and shows the signed-out shell.
4. On the `Foundation` tab, confirm the seeded record is visible with launch count, manual write count, and last opened timestamp.
5. Tap `Write local record` once. Expected result: the manual write count increments immediately.
6. Switch to the `Storage` tab. Expected result: the selected shell section changes and the local database summary remains visible.
7. Fully close the app and reopen it.
8. Expected result after restart:
- the app opens successfully again
- the launch count has incremented
- the manual write count remains persisted
- the last selected shell section remains selected
