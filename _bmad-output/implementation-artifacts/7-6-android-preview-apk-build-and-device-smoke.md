# Story 7.6: Android Preview APK Build And Device Smoke

Status: review

## Metadata
- Story key: 7-6-android-preview-apk-build-and-device-smoke
- Story map ID: E7-S6 (extension derived from Epic 7 release readiness; original first-release cut listed E7-S1 through E7-S4, with 7.5 added for AI provider readiness)
- Epic: Epic 7 - Release Readiness, Deployment, and Optional AI Assist
- Release phase: Mobile Preview Build Readiness
- Created: 2026-05-07

## User Story
As Emilio,
I want a repeatable Android preview APK build and install path,
so that I can test the current TagWise mobile app on a real Android phone without exposing backend secrets or over-scoping into AI job execution.

## Scope
Create the first practical Android preview APK readiness slice:
- Expo/EAS Android preview APK configuration
- safe dev/preview mobile environment configuration
- documented validation, build, download, and install commands
- physical-device smoke checklist for the current app
- explicit limitation notes when the phone cannot reach a backend
- explicit confirmation that OpenAI credentials remain backend-only

This story does not implement AI job execution, backend deployment, production Play Store release, app-store signing strategy, native feature work, or mobile AI UX.

## Acceptance Criteria
1. Android preview APK build configuration exists.
   - Add `mobile/eas.json` or an equivalent EAS build configuration committed in the mobile project.
   - Define a `preview` Android build profile that produces an installable `.apk`, not a Play Store `.aab`.
   - Prefer EAS cloud build as the primary path because this Windows workspace does not currently contain a committed native Android project and Expo local EAS builds are not first-class supported on Windows.
   - Do not commit generated `mobile/android/` output.

2. Mobile package scripts document the preview path.
   - Add a script such as `build:android:preview` in `mobile/package.json`.
   - The script should run the EAS Android preview build for the `preview` profile.
   - If the implementation uses `npx eas-cli`, document that no global EAS install is required.
   - If the implementation adds `eas-cli` as a dev dependency, update `mobile/package-lock.json` through normal npm install flow.

3. Safe mobile preview environment configuration exists.
   - Add a committed example such as `mobile/.env.preview.example`.
   - It may include only public, client-safe values, especially `EXPO_PUBLIC_TAGWISE_API_BASE_URL=http://<LAN-IP-OR-TUNNEL>:4100`.
   - Do not add `OPENAI_API_KEY`, `OPENAI_MODEL`, `TAGWISE_AI_*`, database URLs, auth token secrets, object-storage secrets, or service credentials to any mobile env example.
   - Document that `EXPO_PUBLIC_*` values are bundled into the app and must never contain secrets.

4. Local secret hygiene is explicit.
   - Verify root `.gitignore` ignores `.env` and `.env.*` while allowing `.env.example` and `.env.*.example`.
   - Add equivalent explicit entries to `mobile/.gitignore` if needed so `mobile/.env`, `mobile/.env.preview`, and other local env files are not committed.
   - Do not commit any populated env file.

5. OpenAI API key location is documented correctly.
   - The OpenAI key belongs only in backend runtime environment variables, never in mobile.
   - For local testing, Emilio can set it in the backend shell before running backend AI commands:

     ```powershell
     cd backend
     $env:TAGWISE_AI_ENABLED='true'
     $env:TAGWISE_AI_PROVIDER='openai'
     $env:OPENAI_API_KEY='<real OpenAI key>'
     $env:OPENAI_MODEL='gpt-5-mini'
     npm run ai:smoke
     ```

   - A local `backend/.env` file may be used only as an uncommitted operator convenience if local tooling is added or used to load it; current backend code reads `process.env`.
   - `backend/.env` and `backend/.env.*` must stay gitignored.

6. Build validation commands are documented and pass before attempting an APK build.
   - Minimum mobile checks:

     ```powershell
     cd mobile
     npm ci
     npm run typecheck
     npm test
     npx expo-doctor
     ```

   - Minimum secret exposure check:

     ```powershell
     cd ..
     rg "OPENAI_API_KEY|OPENAI_MODEL|TAGWISE_AI_" mobile
     ```

     Expected: no matches.

7. APK build commands are documented.
   - EAS login/configuration commands are documented for the first run.
   - Preview build command is documented, for example:

     ```powershell
     cd mobile
     npx eas-cli login
     npx eas-cli build --platform android --profile preview
     ```

   - If the build needs a preview API URL in EAS, document `eas env:create` for `EXPO_PUBLIC_TAGWISE_API_BASE_URL` in the `preview` environment, or document the chosen project-safe alternative.

8. Android install steps are documented for a real device.
   - Document EAS dashboard/QR install flow.
   - Document direct APK install with ADB:

     ```powershell
     adb devices
     adb install -r path\to\tagwise-preview.apk
     ```

   - Include Android device prerequisites: allow app installs from the chosen source, and enable USB debugging if using ADB.

9. Physical-device smoke expectations are practical and local/offline aware.
   - On first install, the app should launch, run SQLite migrations, and show the sign-in route without crashing.
   - If no backend is reachable from the phone, connected login, package refresh/download, review, diagnostics upload, and sync endpoints are expected to fail or remain unavailable without crashing.
   - If a backend is reachable and the API base URL points to the computer LAN IP/tunnel rather than `127.0.0.1`, seeded login should work with `tech@tagwise.local` / `TagWise123!`.
   - After at least one connected login and package download, stopping the backend should allow offline session restore and cached package/local workflow checks.
   - `127.0.0.1` inside a physical Android APK means the phone itself, not the developer computer. Use `http://<developer-computer-LAN-IP>:4100`, a tunnel, or a deployed API host.

10. Documentation is updated.
    - Update `mobile/README.md` with preview APK build/install instructions.
    - Add a concise "Known Limitations" section covering backend reachability and the fact that AI diagnostic execution is not yet wired into mobile.
    - Do not claim the APK proves production readiness, backend deployment readiness, or AI workflow readiness.

## Tasks / Subtasks
- [x] Add Android preview build configuration (AC: 1, 2)
  - [x] Add `mobile/eas.json` with a `preview` profile that produces an `.apk`.
  - [x] Add a mobile npm script for the preview Android build.
  - [x] Keep generated native folders out of Git.

- [x] Add safe preview env documentation (AC: 3, 4, 5)
  - [x] Add `mobile/.env.preview.example` with only `EXPO_PUBLIC_TAGWISE_API_BASE_URL`.
  - [x] Tighten `mobile/.gitignore` for local env files if needed.
  - [x] Document that OpenAI key setup remains backend-only.
  - [x] Do not add OpenAI, DB, auth, or storage secrets anywhere under `mobile/`.

- [x] Update mobile README with practical build/install flow (AC: 6, 7, 8, 9, 10)
  - [x] Add validation commands.
  - [x] Add EAS first-run and preview build commands.
  - [x] Add EAS dashboard/QR install path.
  - [x] Add ADB install path.
  - [x] Add real-device smoke checklist and limitations.

- [x] Validate the story implementation (AC: 1-10)
  - [x] Run `cd mobile && npm run typecheck`.
  - [x] Run `cd mobile && npm test`.
  - [x] Run `cd mobile && npx expo-doctor`.
  - [x] Run `rg "OPENAI_API_KEY|OPENAI_MODEL|TAGWISE_AI_" mobile` from repo root and confirm no matches.
  - [x] If an EAS account is available, run the preview APK build or document the exact blocker.

## Dev Notes

### Current Mobile Setup
- `mobile/package.json` is an Expo app using Expo SDK `~54.0.33`, React Native `0.81.5`, React `19.1.0`, TypeScript `~5.9.2`, and Vitest.
- Current scripts are `start`, `android`, `ios`, `web`, `test`, `test:watch`, and `typecheck`.
- `mobile/app.json` defines the Expo app name/slug and plugins for `expo-sqlite`, `expo-secure-store`, and `expo-camera`.
- There is no committed `mobile/android/` folder and no `mobile/eas.json` at story creation time.
- `mobile/.gitignore` already ignores generated `/android` and `/ios` native folders, and root `.gitignore` already ignores `.env` and `.env.*` while allowing example env files.

### Backend Reachability For Physical Devices
- The mobile API base URL is currently resolved by `getDefaultAuthApiBaseUrl()` in `mobile/src/features/auth/authApiClient.ts`.
- Default fallback is `http://127.0.0.1:4100`.
- Physical Android devices cannot use that fallback to reach the developer computer. For device testing, the build needs `EXPO_PUBLIC_TAGWISE_API_BASE_URL` set to a LAN IP, tunnel URL, or deployed API host.
- Backend local API must bind to an address reachable by the phone. The current backend default host is `127.0.0.1`; for LAN testing, run the backend with `TAGWISE_HOST=0.0.0.0` and ensure firewall/network rules allow port `4100`.

### AI And Secret Guardrails
- Story 7.5 passed QA: backend-only AI provider boundary is present and real `npm run ai:smoke` succeeded with provider `openai` and model `gpt-5-mini`.
- This APK story must not change AI provider behavior or mobile app AI behavior.
- The OpenAI API key must never be placed in `mobile/.env*`, `mobile/app.json`, `mobile/eas.json`, mobile source files, APK build config, docs examples with real values, screenshots, logs, or committed artifacts.
- Backend OpenAI configuration remains:
  - `TAGWISE_AI_ENABLED=true`
  - `TAGWISE_AI_PROVIDER=openai`
  - `OPENAI_API_KEY=<real key>`
  - `OPENAI_MODEL=gpt-5-mini` or another selected backend model
- The current backend reads these from `process.env`; do not assume a committed `.env` loader exists unless this is added explicitly in a later backend story.

### Expo/EAS Guidance
- Expo docs state that Android EAS builds default to `.aab` for store distribution, while directly installable device/emulator testing requires `.apk`. Use a preview profile with `android.buildType: "apk"` or internal distribution that produces an APK.
- Expo docs describe `eas.json` as the committed EAS build configuration file and show `preview` profiles for internal testing.
- Expo docs state local env files are normally excluded from version control and that EAS environments can provide build-time variables for `development`, `preview`, and `production`.
- Expo docs note all Expo build tools can prebuild automatically when no native folders exist, which fits the current no-`mobile/android` project state.
- Expo docs also note EAS local builds require local native tooling and are not officially supported on Windows; use cloud EAS as the main story path.

### Suggested `eas.json` Shape
The dev agent may adjust exact fields if Expo tooling generates a better current default, but the committed profile must remain narrow:

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "environment": "preview",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {}
  }
}
```

If EAS requires a project ID, follow EAS CLI prompts and document any account-specific step. Do not treat Expo account login/project creation as a code failure.

### Suggested `mobile/.env.preview.example`

```text
# Public mobile preview config only. Do not put secrets here.
EXPO_PUBLIC_TAGWISE_API_BASE_URL=http://<developer-computer-lan-ip>:4100
```

### Physical Device Smoke Checklist
1. Install the preview APK on an Android phone.
2. Launch TagWise.
3. Confirm the app opens without crashing and finishes local SQLite bootstrap.
4. Confirm the sign-in screen appears if no cached session exists.
5. With backend unreachable, attempt sign-in and confirm a controlled network/auth error, not a crash.
6. With backend reachable through `EXPO_PUBLIC_TAGWISE_API_BASE_URL`, sign in as `tech@tagwise.local` / `TagWise123!`.
7. Refresh assigned packages and download one package.
8. Fully close the app, stop the backend, reopen the app, and confirm offline session restore plus cached package visibility.
9. Confirm no AI diagnostic UI or OpenAI behavior appears in mobile as part of this story.

## Testing Requirements
- `cd mobile && npm run typecheck`
- `cd mobile && npm test`
- `cd mobile && npx expo-doctor`
- `rg "OPENAI_API_KEY|OPENAI_MODEL|TAGWISE_AI_" mobile`
- Optional if credentials/network are available: `cd mobile && npx eas-cli build --platform android --profile preview`
- Manual real-device smoke using either EAS install link/QR or `adb install -r`.

## Known Limitations To Preserve
- A standalone APK cannot reach a backend at `127.0.0.1` unless the backend is running on the phone, which it is not.
- Without a reachable backend and without a previously cached session, Emilio can verify app launch/bootstrap/error handling but cannot complete connected login or package download.
- AI provider readiness is backend-only. This APK does not execute AI diagnosis, show AI suggestions, enqueue AI jobs, or attach AI output to reports.
- Production Play Store release, production signing, backend deployment, and backend public hosting remain separate stories.

## References
- [Architecture Summary](../planning-artifacts/architecture.md#architecture-summary)
- [Offline / Mobile Architecture](../planning-artifacts/architecture.md#offline--mobile-architecture)
- [Architecture Environments](../planning-artifacts/architecture.md#environments)
- [PRD AI Boundary Requirements](../planning-artifacts/prd.md#ai-boundary-requirements)
- [Story 7.5 AI Provider Readiness Boundary](7-5-ai-provider-readiness-boundary.md)
- [Expo: Build APKs for Android Emulators and devices](https://docs.expo.dev/build-reference/apk/)
- [Expo: Configure EAS Build with eas.json](https://docs.expo.dev/build/eas-json/)
- [Expo: Environment variables in EAS](https://docs.expo.dev/eas/environment-variables/)
- [Expo: Switch from Expo Go to a development build](https://docs.expo.dev/develop/development-builds/expo-go-to-dev-build/)
- [Expo: Run EAS Build locally with local flag](https://docs.expo.dev/build-reference/local-builds/)

## Dev Agent Record

### Agent Model Used
GPT-5

### Debug Log References
- `cd mobile && npm ci` - passed; npm audit still reports 4 moderate dependency findings in the existing mobile dependency tree.
- `cd mobile && npm run typecheck` - passed.
- `cd mobile && npm test` - passed, 22 files / 125 tests.
- `cd mobile && npx expo-doctor` - initially found Expo SDK patch mismatches; after `npx expo install expo@~54.0.34 expo-file-system@~19.0.22 expo-image-picker@~17.0.11`, passed 17/17 checks.
- `rg "OPENAI_API_KEY|OPENAI_MODEL|TAGWISE_AI_" mobile` - no matches.
- `cd backend && npm run typecheck` - passed.
- `cd backend && npm test` - passed, 18 files / 92 tests.
- `git diff --check` - passed with CRLF warnings only.
- EAS cloud APK build was not executed in this environment because it requires Emilio's Expo/EAS account login and project credentials.
- 2026-05-07 QA follow-up: `cd mobile && npm run typecheck` - passed after Android cleartext plugin.
- 2026-05-07 QA follow-up: `cd mobile && npm test` - passed, 22 files / 125 tests after Android cleartext plugin.
- 2026-05-07 QA follow-up: `cd mobile && npx expo-doctor` - passed 17/17 after Android cleartext plugin.
- 2026-05-07 QA follow-up: `cd mobile && npx expo config --type public` - passed and showed `./plugins/withAndroidCleartextTraffic` in mobile config.
- 2026-05-07 QA follow-up: `rg "OPENAI_API_KEY|OPENAI_MODEL|TAGWISE_AI_" mobile` - no matches.

### Completion Notes List
- Added EAS preview build configuration for Android APK output using a `preview` profile and internal distribution.
- Added `npm run build:android:preview` so Emilio can start the APK build from the mobile project without a global EAS CLI install.
- Added Android package metadata required for EAS Android builds.
- Added a public-only preview env example for `EXPO_PUBLIC_TAGWISE_API_BASE_URL` and tightened mobile gitignore rules so populated local env files stay uncommitted.
- Updated mobile README with validation commands, EAS preview environment setup, APK build command, EAS/QR and ADB install paths, physical-device smoke checks, backend reachability limits, and backend-only AI key guidance.
- Aligned Expo SDK patch dependencies required by `expo-doctor`; no AI job execution, backend deployment, or backend AI behavior changes were made.
- Added a local Expo config plugin that sets `android:usesCleartextTraffic="true"` during EAS prebuild so preview APKs can call Emilio's local LAN HTTP backend for APK smoke testing.

### File List
- `mobile/.env.preview.example`
- `mobile/.gitignore`
- `mobile/README.md`
- `mobile/app.json`
- `mobile/eas.json`
- `mobile/package-lock.json`
- `mobile/package.json`
- `mobile/plugins/withAndroidCleartextTraffic.js`
- `_bmad-output/implementation-artifacts/7-6-android-preview-apk-build-and-device-smoke.md`

## Change Log
- 2026-05-07: Story created as ready-for-dev for Android preview APK build/device smoke readiness.
- 2026-05-07: Implemented Android preview APK readiness and moved story to review.
- 2026-05-07: Added Android cleartext HTTP manifest plugin for local LAN backend APK smoke testing.
