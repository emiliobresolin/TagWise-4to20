# TagWise Mobile

Story 1.1 bootstraps the mobile shell, local SQLite database, migration runner, and a minimal local-first repository proof path.

Story 1.3 adds connected authentication, secure token storage, offline session restore, and cached role metadata.

Story 1.4 adds user-partitioned local draft, evidence metadata, and queue placeholders plus a user-owned sandbox media path baseline.

Story 1.5 adds baseline mobile diagnostics capture backed by SQLite so forced runtime errors can be stored with device and session context.

Story 2.1 adds a connected package refresh/download flow plus local SQLite persistence for bounded assigned work package snapshots.

Story 8.1 changes the primary APK experience to the dark TagWise technician product shell. The local-first services still bootstrap underneath the UI, but the first visible workflow is now dashboard -> PT-204 detail -> calculation -> comparison/history -> diagnosis -> report -> approval.

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
2. Confirm the app opens into the dark TagWise dashboard with search, QR action, filter chips, recent tags, and Pendentes/Reincidentes/Vencendo sections.
3. With no reachable backend, confirm the PT-204 demo workflow still opens offline from local seeded data.
4. Open PT-204 and navigate through Calcular, Comparar, Diagnosticar, Relatorio, and Aprovacao.
5. With a reachable backend URL configured through `EXPO_PUBLIC_TAGWISE_API_BASE_URL`, sign in as `tech@tagwise.local` / `TagWise123!` from the compact connection panel.
6. Refresh assigned packages if the session is connected, then fully close the app, stop the backend, reopen the app, and confirm the dark shell still opens with offline session state when cached.
7. Confirm there is no mobile AI diagnostic execution and no backend AI credential, model, or feature-flag configuration in this preview APK.

### Visual Shell Smoke

The Story 8.1 shell is intentionally usable without backend connectivity for first APK review. Use this path on the phone:

1. Dashboard: verify TagWise logo/header, search, QR button, chips, recently opened cards, and grouped tag sections.
2. Tap PT-204 from Pendentes.
3. Detail: verify Falha status, variable range, latest value, occurrence/due cards, and action tiles.
4. Calcular: verify expected value, observed value, tolerance, error, and FALHA result.
5. Comparar: verify history trend rows and open Diagnosticar.
6. Diagnosticar: select a symptom, review hypothesis, next step, explanation, and checklist.
7. Relatorio: review summary, attachments placeholders, pending items, and justification.
8. Aprovacao: verify summary, technician rationale, checklist, Aprovar, and Devolver.

### Known Limitations

- `127.0.0.1` inside a physical Android APK means the phone itself, not the developer computer. Use `http://<developer-computer-lan-ip>:4100`, a tunnel, or a deployed API host.
- Without a reachable backend and without a previously cached session, this APK can validate app launch, local SQLite bootstrap, and controlled error handling, but it cannot complete connected login or package download.
- AI provider readiness remains backend-only. This preview APK does not execute AI diagnosis, enqueue AI jobs, show AI suggestions, or attach AI output to reports.
- This preview APK path does not prove Play Store readiness, production signing readiness, backend deployment readiness, or AI workflow readiness.

## Manual Smoke Test
1. Run `npm start`.
2. Open the app on an Android emulator, iOS simulator, or Expo Go.
3. Wait for the loading view to finish. Expected result: the app opens into the dark TagWise dashboard, even without a cached session.
4. Open PT-204 and complete the local visual shell path through Calcular, Comparar, Diagnosticar, Relatorio, and Aprovacao.
5. Sign in with a seeded backend user such as `tech@tagwise.local` / `TagWise123!` from the connection card.
6. Expected result after sign-in:
- the dark shell remains the primary UI
- the role/session state appears in the connection card
- package refresh is available only when the session is connected
7. Tap `Atualizar pacotes` when the backend is reachable.
8. Expected result after package refresh:
- the connection card updates package counts
- the PT-204 seeded visual workflow remains available
9. Fully close the app, stop the backend API, and reopen the app.
10. Expected result after offline reopen:
- the app restores the cached user session when available
- the visual shell remains usable from seeded/local data
- review/approval in this visual shell remains a demo/offline product flow, not a server-authoritative supervisor decision
