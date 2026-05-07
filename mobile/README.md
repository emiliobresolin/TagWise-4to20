# TagWise Mobile

Story 1.1 bootstraps the mobile shell, local SQLite database, migration runner, and a minimal local-first repository proof path.

Story 1.3 adds connected authentication, secure token storage, offline session restore, and cached role metadata.

Story 1.4 adds user-partitioned local draft, evidence metadata, and queue placeholders plus a user-owned sandbox media path baseline.

Story 1.5 adds baseline mobile diagnostics capture backed by SQLite so forced runtime errors can be stored with device and session context.

Story 2.1 adds a connected package refresh/download flow plus local SQLite persistence for bounded assigned work package snapshots.

## Commands
- `npm start`
- `npm run android`
- `npm run ios`
- `npm test`
- `npm run typecheck`
- `npm run build:android:preview`

Optional environment:
- `EXPO_PUBLIC_TAGWISE_API_BASE_URL=http://127.0.0.1:4100`

## Android Preview APK

The preview Android build uses EAS cloud build and produces an installable APK for physical-device testing. This project does not commit a generated `android/` folder, and Windows local EAS builds are not the supported path for this story.

The preview Android build also applies a small local Expo config plugin that allows cleartext HTTP traffic on Android. This is required for first-device testing against a local LAN backend such as `http://192.168.1.4:4100`.

Before building, run the local validation checks:

```powershell
cd mobile
npm ci
npm run typecheck
npm test
npx expo-doctor
```

Also run the mobile secret exposure check from the repository root. It should return no matches for backend OpenAI credential variables or TagWise backend AI feature flags. OpenAI credentials are backend-only; do not put backend AI credentials, model settings, database URLs, auth token secrets, or storage credentials in any mobile file or EAS mobile environment variable.

For a physical Android phone, set the preview API URL to a backend address the phone can actually reach. Use `mobile/.env.preview.example` as the safe shape for local notes, but configure EAS preview builds with a public client value:

```powershell
cd mobile
npx eas-cli login
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_TAGWISE_API_BASE_URL --value http://<developer-computer-lan-ip>:4100 --visibility plaintext
```

`EXPO_PUBLIC_*` values are bundled into the app and must never contain secrets. If using a LAN URL, run the backend API on a reachable host and allow the port through the local firewall:

```powershell
cd ..\backend
$env:TAGWISE_HOST='0.0.0.0'
npm run dev:api
```

Build the preview APK:

```powershell
cd mobile
npm run build:android:preview
```

The script runs:

```powershell
npx eas-cli build --platform android --profile preview
```

### Install On Android

Option 1: EAS install link or QR

1. Open the completed EAS build link printed by the build command, or open the build from the Expo dashboard.
2. On the Android phone, open the install link or scan the QR code.
3. Allow installs from the browser or Expo source if Android asks.
4. Install and launch TagWise.

Option 2: ADB

1. Enable Developer options and USB debugging on the Android phone.
2. Download the APK from the completed EAS build to your computer.
3. Connect the phone by USB.
4. Run:

```powershell
adb devices
adb install -r path\to\tagwise-preview.apk
```

### Physical Device Smoke

1. Launch TagWise after installing the preview APK.
2. Confirm the app opens without crashing and completes local SQLite bootstrap.
3. Confirm the sign-in screen appears when no cached session exists.
4. With no reachable backend, attempt sign-in and confirm the app shows a controlled network/auth error instead of crashing.
5. With a reachable backend URL configured through `EXPO_PUBLIC_TAGWISE_API_BASE_URL`, sign in as `tech@tagwise.local` / `TagWise123!`.
6. Refresh assigned packages and download one package.
7. Fully close the app, stop the backend, reopen the app, and confirm offline session restore plus cached package visibility.
8. Confirm there is no mobile AI diagnostic UI or OpenAI behavior in this preview APK.

### Known Limitations

- `127.0.0.1` inside a physical Android APK means the phone itself, not the developer computer. Use `http://<developer-computer-lan-ip>:4100`, a tunnel, or a deployed API host.
- Without a reachable backend and without a previously cached session, this APK can validate app launch, local SQLite bootstrap, and controlled error handling, but it cannot complete connected login or package download.
- AI provider readiness remains backend-only. This preview APK does not execute AI diagnosis, enqueue AI jobs, show AI suggestions, or attach AI output to reports.
- This preview APK path does not prove Play Store readiness, production signing readiness, backend deployment readiness, or AI workflow readiness.

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
12. Return to the `Foundation` route and tap `Capture diagnostic error`.
13. Expected result after diagnostics capture:
- `Captured errors` increments
- `Latest mobile diagnostic` shows `Forced mobile diagnostics capture`
- the stored diagnostic remains available after fully closing and reopening the app
14. Return to the `Packages` route and tap `Refresh assigned packages`.
15. Expected result after package refresh:
- at least one assigned package card appears
- each card shows package id, priority, tag count, and due window
16. Tap `Download snapshot` on one assigned package.
17. Expected result after package download:
- the package card shows a non-empty `Downloaded` timestamp
- fully closing and reopening the app keeps the downloaded package visible on the `Packages` route
- if the backend API is stopped, the app still shows the cached downloaded package while refresh/download controls stay unavailable offline
