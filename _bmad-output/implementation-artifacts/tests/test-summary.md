# Test Automation Summary

## 2026-05-11 Full Regression Run (Story 8.6 ready-for-review)

### Verdict

**PASS** on the existing automated regression. 267 tests passed across mobile + backend, 1 file skipped by design.

### What ran

| Suite | Files | Tests | Duration | Result |
|---|---|---|---|---|
| `mobile` typecheck (`tsc --noEmit`) | n/a | n/a | n/a | PASS |
| `mobile` vitest (`npm test`) | 32 | 174 passed | 3.50 s | PASS |
| `mobile` `npx expo-doctor` | 17 checks | n/a | n/a | 17/17 PASS |
| `backend` typecheck (`tsc --noEmit`) | n/a | n/a | n/a | PASS |
| `backend` vitest (`npm test`) | 18 / 1 skipped (19 total) | 92 passed / 1 skipped | 8.34 s | PASS |

Skipped suite: [`backend/src/api/tagWiseLiveApiSmoke.test.ts`](../../../backend/src/api/tagWiseLiveApiSmoke.test.ts) — gated behind `TAGWISE_LIVE_API_BASE_URL`. Skipping is the intended behavior when no live backend URL is provided. Run with `$env:TAGWISE_LIVE_API_BASE_URL='http://127.0.0.1:4100'; npm test -- tagWiseLiveApiSmoke` against a running backend to exercise it.

### Test-count growth vs 2026-05-07 baseline

| | 2026-05-07 | 2026-05-11 | Δ |
|---|---:|---:|---:|
| Mobile files | 22 | 32 | +10 |
| Mobile tests | 125 | 174 | +49 |
| Backend files | 16 | 19 | +3 |
| Backend tests | 76 | 93 | +17 |
| **Total tests** | **201** | **267** | **+66** |

Significant growth driven by Stories 7.x and 8.x. New mobile suites since baseline include `executionFlow`, `fieldCalculator`, `serviceBackedExecution`, `serviceBackedReport`, `serviceBackedReview`, `serviceBackedPackages`, `technicianReports`, `manualInstrumentService`, `evidenceUploadOrchestrator`, and `syncStateConnectivityRegain`.

### Coverage map — what the automated regression *does* cover

Mobile (service / pure-logic level):
- Visual-shell projections: `executionFlow`, `fieldCalculator`, `serviceBackedExecution` (incl. PV→% and unavailable-reason mapping), `serviceBackedReport` (lifecycle, sync detail, AI projection, technician submit NOT routed to approval), `serviceBackedReview` (RBAC, queue grouping, decision dispatch, PT-BR feedback), `serviceBackedPackages`, `serviceBackedNavigation`, `technicianReports`, `visualWorkflow` (PT-204 demo flag gating).
- Execution domain: `sharedExecutionShellService`, `deterministicCalculationEngine`, `executionTemplateSelection`, `localExecutionTemplateRegistry`.
- Local data + repos: `bootstrapLocalDatabase`, `sqlite/bootstrap`, `userPartitionedLocalStoreFactory`, `localTagContextService`, `localTagEntryService`, `localQrScanService`.
- Sync stack: `syncStateService`, `syncStateModel`, `syncStateConnectivityRegain`, `evidenceUploadOrchestrator`.
- Auth/session/diagnostics: `sessionController`, `mobileErrorCapture`, `mobileDiagnosticsReporter`.
- Review: `supervisorReviewService`.
- Work packages: `assignedWorkPackageCatalogService`, `assignedWorkPackageReadiness`, `manualInstrumentService`.
- Platform: `photoAcquisitionBoundary`.
- Runtime: `runtimeCleanup`.

Backend (service + API E2E level):
- Real API E2E flow through `tagWiseApiE2e.test.ts` covering login → package download → diagnostics → evidence sync (metadata, authorization, binary finalize) → report submission → supervisor escalation → manager approval, with persistence assertions against `pg-mem`.
- API request handler, payload validation, report submissions, worker jobs, auth, AI diagnosis provider factory, structured logging, migrations, object storage.
- Ops smoke harnesses: release smoke, release observability, deployment preflight, worker resilience drill, backup-restore verification, AI diagnosis smoke.

### Coverage gaps — what the automated regression does *not* cover (relevant to your manual phone smoke)

These are the areas where green tests do **not** prove the phone works. Your manual testing is the only existing safety net for them today.

1. **No rendered React Native component tests.** `mobile/package.json` does not include `@testing-library/react-native` or any renderer harness. Nothing exercises the actual component tree.
2. **No tests for `mobile/src/shell/VisualProductShell.tsx` (6,169 lines).** All AC-relevant UX wiring — route transitions, scroll-to-top, KeyboardAvoidingView, `handleSelectTemplateAndOpen`, `handleSaveLoopTest`, `handleApplyCalculatorResult`, pending-action navigation, the submit blocker card — is verified only by inspection.
3. **No tests for `mobile/src/shell/TagWiseApp.tsx` (5,040 lines).** Service-to-shell wiring: `handleSubmitExecutionReport`, `handleApproveSupervisorReviewReport`, `handleReturnSupervisorReviewReport`, `handleEscalateSupervisorReviewReport`, `handleSaveLoopTestNote`, `handleAttachExecutionPhoto`. The underlying services are tested; the wrapper logic that constructs PT-BR `authMessage` and refreshes the queue is not.
4. **No on-device E2E harness.** No Maestro, Detox, Appium, or Expo dev-client automation. Touch ergonomics, font scaling, Android keyboard behavior, Android nav-bar overlap, Camera/Galeria permission flows, and SQLite migration on real devices are all unguarded.
5. **Live backend smoke not exercised in this run** — see skipped suite above.
6. **Backend AI provider integration** is tested at the factory + smoke harness level. There is no end-to-end test against a real LLM provider (by design — AI is report-level and nonblocking).

The gap that produced Story 8.6 in the first place ("automated tests passed but phone workflow was product-blocking") still applies to the categories above. Closing it requires either component-render tests or an on-device E2E harness — both new dev dependencies, not in scope for "run the regression."

### Phone-smoke alignment

Your manual testing should focus on the exact categories above. The 27-step smoke checklist from the Story 8.6 code review (login + selection, loop test, calculator, compare/history, report/evidence/AI, keyboard/scroll/Android nav, supervisor) targets these gaps. Anything you find on the phone that the automated suite already covers is a true regression and should be filed; anything you find in the uncovered categories is a known automation gap that this run could not have caught.

### Commands used

```powershell
cd mobile
npm run typecheck
npm test
npx expo-doctor

cd ..\backend
npm run typecheck
npm test
```

### Recommendations

- **Now:** proceed with manual phone smoke against this APK build. The automated suite is healthy and adds confidence to the service layer; it does not replace device verification.
- **After phone smoke:** if defects are found, file them with the phone-smoke step number. I can then generate targeted regression tests at the lowest sensible layer (preferring projection/service-level tests since they run fast and don't need a device).
- **Optional follow-up:** install Maestro for a small "golden path" device flow (login → select loop template → run 5-point loop → submit → see fila local feedback). This is the highest-leverage net-new investment because it directly catches Story 8.6-style regressions before the QA cycle.

---

## 2026-05-07 Story 8.1 Baseline (preserved)

> The sections below are the original test-summary.md content from 2026-05-07. They describe the framework setup, the initial Story 8.1 manual APK regression result, and earlier coverage notes. They are kept verbatim for traceability.

### Scope

Project-level automated test pass for TagWise on 2026-05-07.

### Framework

- Backend: Vitest with TypeScript, Node runtime, pg-mem for PostgreSQL-compatible E2E persistence.
- Mobile: Vitest with TypeScript, Node SQLite test helpers for local-first services.
- Native mobile/device E2E harness: not configured yet.

### Generated Tests

#### API E2E Tests

- [x] `backend/src/api/tagWiseApiE2e.test.ts` - starts the real API HTTP runtime, runs migrations, seeds users/packages/routes, drives a connected technician report through login, package download, mobile diagnostics telemetry, evidence metadata sync, upload authorization, binary finalization, report submission, supervisor escalation, manager approval, and verifies PostgreSQL rows/audit events.
- [x] `backend/src/api/tagWiseApiE2e.test.ts` - verifies critical HTTP guardrails for unauthenticated package access and malformed report-submission payloads.
- [x] `backend/src/api/tagWiseLiveApiSmoke.test.ts` - opt-in live API smoke test for a running local/LAN backend covering health, readiness, metrics, login, refresh, package list/download, and supervisor/manager queue access.

#### Existing Automated Coverage Re-run

- [x] Backend API/service/repository/ops tests.
- [x] Mobile local SQLite, auth/session, work-package, execution, sync, diagnostics, and review service tests.

### Coverage

- Backend API workflow E2E coverage: health/readiness, auth, assigned packages, mobile diagnostics, evidence sync, report submission, supervisor review, manager review, persistence verification.
- Backend API critical error coverage: unauthenticated access and malformed report submission.
- Mobile automated coverage: service/integration-level only; no rendered React Native UI or emulator-driven E2E assertions yet.
- Real infrastructure coverage: simulated in automation with pg-mem and object-storage test double; real PostgreSQL/MinIO/S3 smoke remains manual or environment-run.

### Validation Results

- `cd backend && npm test -- tagWiseApiE2e` - passed, 1 file / 2 tests.
- `cd backend && $env:TAGWISE_LIVE_API_BASE_URL='http://127.0.0.1:4100'; npm test -- tagWiseLiveApiSmoke` - passed, 1 file / 1 test.
- `cd backend && $env:TAGWISE_LIVE_API_BASE_URL='http://192.168.1.4:4100'; npm test -- tagWiseLiveApiSmoke` - passed, 1 file / 1 test.
- `cd backend && npm run typecheck` - passed.
- `cd mobile && npm run typecheck` - passed.
- `cd backend && npm test` - passed, 16 files / 76 tests.
- `cd mobile && npm test` - passed, 22 files / 125 tests.
- `git diff --check` - passed.

### 2026-05-07 Story 8.1 Manual APK Regression Result

- Story 8.1 automated checks and live backend smoke do not prove the rebuilt APK workflow is acceptable.
- Manual APK review found the dark visual shell behaves like mostly static screens and bypasses previously working mobile foundations.
- Story 8.1 QA verdict changed to `Needs fixes`.
- Minimum next test need: after dev fix, run the APK on a real Android phone through dashboard -> tag detail -> calculation -> comparison/history -> diagnosis/checklist -> report -> supervisor/demo approval, with editable calculator inputs and no automatic approval jump.

### Environment Findings

- Backend canonical database: PostgreSQL via `TAGWISE_DATABASE_URL`.
- Backend evidence/media storage: S3-compatible object storage via `TAGWISE_STORAGE_*`.
- Mobile local database: Expo SQLite database named `tagwise.db`.
- Current diagnostics feature: mobile runtime error telemetry at `POST /diagnostics/mobile-errors`; this is not AI diagnosis.
- AI assist/diagnosis is not implemented as a runnable provider integration yet. The architecture describes a future async AI adapter boundary, but there are no AI provider environment variables or API-key checks in the current backend env contract.

### What Is Still Needed For Full Testing

- Run the backend against real local infrastructure: PostgreSQL plus MinIO or another S3-compatible bucket.
- Export the values from `backend/.env.example`, then run migrations, storage smoke, API, and worker.
- Run manual mobile smoke on Android/iOS/Expo Go with `EXPO_PUBLIC_TAGWISE_API_BASE_URL=http://127.0.0.1:4100` or the device-reachable host equivalent.
- Add a native mobile E2E harness such as Maestro or Detox to automate sign-in, package refresh/download, execution evidence capture, report submission, diagnostics capture, review actions, offline reopen, and reconnect retry.
- Implement the future AI assist adapter, provider config, API key env vars, queue/job persistence, and test doubles before calling AI diagnosis ready.

### Checklist (2026-05-07 baseline)

- [x] API tests generated.
- [x] E2E test generated for the backend workflow surface currently available.
- [x] Tests use standard Vitest APIs.
- [x] Tests cover happy path and critical error cases.
- [x] Generated tests run successfully.
- [x] Test summary created.
- [x] Coverage metrics included.
