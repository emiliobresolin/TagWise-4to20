# Test Automation Summary

## Scope

Project-level automated test pass for TagWise on 2026-05-07.

## Framework

- Backend: Vitest with TypeScript, Node runtime, pg-mem for PostgreSQL-compatible E2E persistence.
- Mobile: Vitest with TypeScript, Node SQLite test helpers for local-first services.
- Native mobile/device E2E harness: not configured yet.

## Generated Tests

### API E2E Tests

- [x] `backend/src/api/tagWiseApiE2e.test.ts` - starts the real API HTTP runtime, runs migrations, seeds users/packages/routes, drives a connected technician report through login, package download, mobile diagnostics telemetry, evidence metadata sync, upload authorization, binary finalization, report submission, supervisor escalation, manager approval, and verifies PostgreSQL rows/audit events.
- [x] `backend/src/api/tagWiseApiE2e.test.ts` - verifies critical HTTP guardrails for unauthenticated package access and malformed report-submission payloads.
- [x] `backend/src/api/tagWiseLiveApiSmoke.test.ts` - opt-in live API smoke test for a running local/LAN backend covering health, readiness, metrics, login, refresh, package list/download, and supervisor/manager queue access.

### Existing Automated Coverage Re-run

- [x] Backend API/service/repository/ops tests.
- [x] Mobile local SQLite, auth/session, work-package, execution, sync, diagnostics, and review service tests.

## Coverage

- Backend API workflow E2E coverage: health/readiness, auth, assigned packages, mobile diagnostics, evidence sync, report submission, supervisor review, manager review, persistence verification.
- Backend API critical error coverage: unauthenticated access and malformed report submission.
- Mobile automated coverage: service/integration-level only; no rendered React Native UI or emulator-driven E2E assertions yet.
- Real infrastructure coverage: simulated in automation with pg-mem and object-storage test double; real PostgreSQL/MinIO/S3 smoke remains manual or environment-run.

## Validation Results

- `cd backend && npm test -- tagWiseApiE2e` - passed, 1 file / 2 tests.
- `cd backend && $env:TAGWISE_LIVE_API_BASE_URL='http://127.0.0.1:4100'; npm test -- tagWiseLiveApiSmoke` - passed, 1 file / 1 test.
- `cd backend && $env:TAGWISE_LIVE_API_BASE_URL='http://192.168.1.4:4100'; npm test -- tagWiseLiveApiSmoke` - passed, 1 file / 1 test.
- `cd backend && npm run typecheck` - passed.
- `cd mobile && npm run typecheck` - passed.
- `cd backend && npm test` - passed, 16 files / 76 tests.
- `cd mobile && npm test` - passed, 22 files / 125 tests.
- `git diff --check` - passed.

## 2026-05-07 Story 8.1 Manual APK Regression Result

- Story 8.1 automated checks and live backend smoke do not prove the rebuilt APK workflow is acceptable.
- Manual APK review found the dark visual shell behaves like mostly static screens and bypasses previously working mobile foundations.
- Story 8.1 QA verdict changed to `Needs fixes`.
- Minimum next test need: after dev fix, run the APK on a real Android phone through dashboard -> tag detail -> calculation -> comparison/history -> diagnosis/checklist -> report -> supervisor/demo approval, with editable calculator inputs and no automatic approval jump.

## Environment Findings

- Backend canonical database: PostgreSQL via `TAGWISE_DATABASE_URL`.
- Backend evidence/media storage: S3-compatible object storage via `TAGWISE_STORAGE_*`.
- Mobile local database: Expo SQLite database named `tagwise.db`.
- Current diagnostics feature: mobile runtime error telemetry at `POST /diagnostics/mobile-errors`; this is not AI diagnosis.
- AI assist/diagnosis is not implemented as a runnable provider integration yet. The architecture describes a future async AI adapter boundary, but there are no AI provider environment variables or API-key checks in the current backend env contract.

## What Is Still Needed For Full Testing

- Run the backend against real local infrastructure: PostgreSQL plus MinIO or another S3-compatible bucket.
- Export the values from `backend/.env.example`, then run migrations, storage smoke, API, and worker.
- Run manual mobile smoke on Android/iOS/Expo Go with `EXPO_PUBLIC_TAGWISE_API_BASE_URL=http://127.0.0.1:4100` or the device-reachable host equivalent.
- Add a native mobile E2E harness such as Maestro or Detox to automate sign-in, package refresh/download, execution evidence capture, report submission, diagnostics capture, review actions, offline reopen, and reconnect retry.
- Implement the future AI assist adapter, provider config, API key env vars, queue/job persistence, and test doubles before calling AI diagnosis ready.

## Checklist

- [x] API tests generated.
- [x] E2E test generated for the backend workflow surface currently available.
- [x] Tests use standard Vitest APIs.
- [x] Tests cover happy path and critical error cases.
- [x] Generated tests run successfully.
- [x] Test summary created.
- [x] Coverage metrics included.
