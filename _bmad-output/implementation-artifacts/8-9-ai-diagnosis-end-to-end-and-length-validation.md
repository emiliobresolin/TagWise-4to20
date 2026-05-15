# Story 8.9 — AI diagnosis end-to-end + length validation

Status: review

## Metadata

- Story key: 8-9-ai-diagnosis-end-to-end-and-length-validation
- Epic: Epic 8 live phone repair continuation
- Created: 2026-05-14
- Validation gate: **manual phone smoke using the user's 4-terminal workflow** (deferred per user choice: one APK rebuild after all software-only iteration is done).
- Source: QA Pass 2 defect discovery report (`_bmad-output/planning-artifacts/qa-defect-discovery-2026-05-14-pass-2.md`), defect D-01 + concerns C-01 / C-02.

## User Story

As a technician submitting a calibration report, and as a supervisor reviewing it,
I want assistive AI diagnosis to actually run end-to-end —
either when the technician taps "Solicitar diagnóstico assistido" on the report screen,
or automatically when the report is accepted by the backend —
so the supervisor sees a useful assistive summary on the review screen instead of "Indisponível" for every report.
The AI provider boundary must remain server-side; mobile must not call any AI provider directly;
and AI failures must NEVER halt the report itself.

Bundled carry-forward concerns from QA Pass 2:
- **C-01** (medium) — `AppState`-only connectivity regain misses in-app network restores. **Deferred** — NetInfo would require installing a new native dependency and rebuilding native code; we add a documented manual fallback (existing retry-sync button) and defer the proper NetInfo wiring to a small follow-up story.
- **C-02** (medium, pre-existing) — Backend did not bound `contextNote` / `technicianNote` string length. **Fixed in this story** — `validateOptionalPhotoMetadata` enforces 500-char / 2000-char caps; mobile `TextInput` carries a matching `maxLength`.

## Scope

In scope:

### D-01 — AI diagnosis end-to-end

1. **DB migration `0014_ai_diagnoses`**: per-report row keyed by `(owner_user_id, report_id)`, four canonical states (`pending` / `available` / `unavailable` / `failed-nonblocking`), JSON result, provider label, generated/last-requested timestamps, last-request source (`auto-on-submit` | `manual`). FK to `report_submission_records` with `ON DELETE CASCADE`.
2. **`AiDiagnosisRepository`**: `getByReportId`, `upsertPending`, `markAvailable`, `markFailedNonblocking`. Conflict-safe upsert: re-requesting an `available` report is a no-op; re-requesting a `failed-nonblocking` row flips back to `pending`.
3. **`AiDiagnosisService`** (`requestForReport`, `getByReportId`): builds the canonical `AiDiagnosisInput` from the stored report payload + work package snapshot, upserts the pending row, enqueues a worker job. Errors as `AiDiagnosisServiceError` with structured status codes.
4. **Worker job handler `ai-diagnosis.generate-for-report`** (`createAiDiagnosisJobHandler`): registered in `worker/main.ts` alongside the existing `ops.restart-drill`. Reads job payload, calls the provider via `createAiDiagnosisProvider(environment.ai)`, persists result. Provider errors → row to `failed-nonblocking` AND re-throw so the worker retries within its budget; after max attempts the worker marks the job failed but the AI row stays `failed-nonblocking` so the supervisor still sees a clear status.
5. **Auto-enqueue at `ReportSubmissionService.submitForValidation`**: after acceptance the service calls `aiDiagnosisService.requestForReport({ source: 'auto-on-submit' })`. Failures are caught and logged via `onAiEnqueueError`; **AI failures never propagate to the technician submission path.**
6. **Manual HTTP endpoint `POST /reports/:reportId/ai-diagnosis/request`**: authenticated, accepts technician or supervisor users (any role with auth), returns the current AI projection. Returns 503 when AI service is not wired (legacy bootstrap), 404 when the report is not found, 409 when the payload is malformed.
7. **Supervisor / manager review extension**: `SupervisorReviewReportDetail.aiDiagnosis` field added; `SupervisorReviewService.getSupervisorReportDetail` and `ManagerReviewService.getManagerReportDetail` now optionally accept an `AiDiagnosisService` and embed the latest projection in the response.
8. **Technician status extension**: `ReportSubmissionStatusResult.aiDiagnosis` field added; `getReportStatus` reads the AI row alongside approval history.
9. **Mobile API client widening**: `ReportSubmissionStatusResponse.aiDiagnosis` field added; new `requestAiDiagnosis(reportId)` method on `EvidenceUploadApiClient`.
10. **Mobile state threading**: `executionAiDiagnosis` and `supervisorAiDiagnosis` fields on `TagWiseApp` ready state; refreshed by `handleRefreshExecutionReportServerStatus` (via `syncStateService.refreshReportServerStatus` which now returns `{ shell, aiDiagnosis }`) and by `handleRequestExecutionAiDiagnosis`; the supervisor projection is refreshed when a report is opened.
11. **Mobile projection threading**: `buildVisualReportProjection(executionShell, reportSyncDetail, executionAiDiagnosis)` and `buildVisualReviewDetailProjection(report, access, supervisorAiDiagnosis)` are now called with the third argument populated.
12. **Mobile manual AI request UI**: a `Solicitar diagnostico assistido` Pressable on the report screen, visible when `aiDiagnosis.state !== 'available'`. PT-BR copy: "Aguardando diagnostico (toque para reverificar)" when state is `pending`, "Solicitar diagnostico assistido" otherwise.

### C-02 — Length validation

13. Backend `validateOptionalPhotoMetadata` enforces `CONTEXT_NOTE_MAX_LENGTH = 500` and `TECHNICIAN_NOTE_MAX_LENGTH = 2000`. Violations raise a structured `malformed-report-payload` error.
14. Mobile `TextInput` for the technician note carries `maxLength={2000}`.
15. Two new backend tests prove the validator path.

### C-01 — Connectivity regain (deferred)

16. The Story 8.8 `AppState` foreground trigger remains. NetInfo wiring (the in-app regain case the QA Pass 2 report flagged) is **explicitly deferred** to a small follow-up story since it requires a new native dependency and an Expo config touch. The existing `Atualizar status do servidor` button + manual `Tentar novamente` chip already give the technician a software-only fallback in the in-app drop-and-recover scenario.

Out of scope (defer to later stories):

- New prior-`Report` entities + prior approval-decision records (Story 8.10 data depth — still deferred).
- NetInfo integration as a secondary regain trigger (small follow-up; not blocking the next phone test).
- Manual "Solicitar diagnóstico assistido" on the supervisor side (the supervisor reads what the technician triggered; can be added later if the operational pattern needs it).
- Updating prior backend OpenAI provider configuration (uses existing `TAGWISE_AI_PROVIDER='mock'` defaults).

## Non-Goals

- Do not block report submission on AI provider availability.
- Do not put any AI provider secrets or SDK code on the mobile side.
- Do not change the Story 8.7 submit-rule or the Story 8.8 `contextNote`/`technicianNote` semantics.
- Do not break existing tests; do not add new dev dependencies.
- Do not run AI automatically on every screen mount or input change — it runs only on (a) report submission acceptance, or (b) explicit technician tap.

## Acceptance Criteria

### AC 1 — Backend AI persistence + worker

- `0014_ai_diagnoses` migration creates the table with the four-state CHECK constraint and the cascading FK to `report_submission_records`. Migration test asserts schema version → 14.
- `AiDiagnosisRepository.upsertPending` is conflict-safe and treats `available` rows as terminal until the result is explicitly discarded.
- `AiDiagnosisService.requestForReport({ user, reportId, source })` resolves the report, builds the AI input, upserts the pending row, and enqueues a worker job with a deterministic idempotency key. Re-requesting an `available` report does NOT enqueue.
- `createAiDiagnosisJobHandler` runs the provider, persists the result (`markAvailable` on success / `markFailedNonblocking` on error), and re-throws on failure so the worker can retry.

### AC 2 — Submission auto-enqueue

- `ReportSubmissionService` accepts an optional `aiDiagnosisService`. When provided, every successful `submitForValidation` (both first-time submissions and returned-report resubmissions) triggers `requestForReport({ source: 'auto-on-submit' })`.
- Enqueue errors are caught and reported via `onAiEnqueueError` (logged in production via `api/main.ts`). The technician submission path returns normally even if the AI enqueue fails.

### AC 3 — Manual HTTP endpoint

- `POST /reports/:reportId/ai-diagnosis/request` authenticates the caller, invokes `aiDiagnosisService.requestForReport({ source: 'manual' })`, and returns `{ aiDiagnosis: ReportSubmissionAiDiagnosisProjection }`.
- Returns 503 when AI service is not configured; 404 when the report is not found; 4xx with the structured error message for malformed payloads.

### AC 4 — Supervisor + technician projections

- `SupervisorReviewReportDetail.aiDiagnosis` and `ReportSubmissionStatusResult.aiDiagnosis` are always present; rows missing on the backend resolve to state `unavailable`.
- The supervisor and manager review services accept an optional `AiDiagnosisService` and resolve the latest row at read time.

### AC 5 — Mobile threading + UI

- `EvidenceUploadApiClient.requestAiDiagnosis(reportId)` posts to the manual endpoint.
- `EvidenceUploadOrchestrator.refreshReportServerStatus` now returns `{ shell, aiDiagnosis }`; `syncStateService.refreshReportServerStatus` returns the same shape; `TagWiseApp` maps the projection into the in-memory `executionAiDiagnosis` state.
- `handleRequestExecutionAiDiagnosis` calls the orchestrator and updates `executionAiDiagnosis`; errors surface as a non-blocking PT-BR message via `authMessage`.
- The report screen renders a `Solicitar diagnostico assistido` Pressable visible only when `aiDiagnosis.state !== 'available'`. The Pressable's label changes to "Aguardando diagnostico (toque para reverificar)" when the state is `pending`.
- `buildVisualReportProjection` and `buildVisualReviewDetailProjection` are now called with the third argument; supervisor review detail shows the AI section reflecting backend state.

### AC 6 — Length validation (C-02)

- Backend `validateOptionalPhotoMetadata` rejects `contextNote` > 500 chars or `technicianNote` > 2000 chars with `reasonCode: 'malformed-report-payload'`.
- Two new vitest cases in `reportSubmissionService.test.ts` prove each branch.
- Mobile `TextInput` for the technician note carries `maxLength={2000}`.

### AC 7 — Story 8.8 guardrails intact

- All existing tests pass (mobile 186/186 unchanged from 8.8 baseline; backend grows from 92 → 99 with the new AI + length tests).
- Submit rule, per-attachment try/catch, classifySyncError, back handler, photo round-trip, vertical layout, PT-BR sweep all intact.

## Tasks / Subtasks

- [x] T1. Add `0014_ai_diagnoses` migration. Update migrations test.
- [x] T2. Build `AiDiagnosisRepository` (upsertPending / markAvailable / markFailedNonblocking / getByReportId).
- [x] T3. Build `AiDiagnosisService` with `requestForReport`, `getByReportId`, and a deterministic idempotency-key helper.
- [x] T4. Build `createAiDiagnosisJobHandler` (the worker job handler) with provider error → `failed-nonblocking` semantics.
- [x] T5. Wire `aiDiagnosisService` into `ReportSubmissionService` (optional injection, auto-enqueue after acceptance, error-safe).
- [x] T6. Add `aiDiagnosis` to `ReportSubmissionStatusResult` + `SupervisorReviewReportDetail`. Update supervisor / manager service to optionally accept the AI service and include the projection.
- [x] T7. Add `POST /reports/:reportId/ai-diagnosis/request` to the API request handler.
- [x] T8. Wire `aiDiagnosisService` in `api/main.ts` (including `ReportSubmissionService` options and `SupervisorReviewService` / `ManagerReviewService` constructors). Register `createAiDiagnosisJobHandler` in `worker/main.ts`.
- [x] T9. Backend tests for `AiDiagnosisService.requestForReport` (3 cases) and `createAiDiagnosisJobHandler` (2 cases). Backend tests for the length validator (2 cases).
- [x] T10. Widen mobile API client surface: `ReportSubmissionStatusResponse.aiDiagnosis`, `AiDiagnosisRequestResponse`, `requestAiDiagnosis` method.
- [x] T11. Extend `EvidenceUploadOrchestrator.refreshReportServerStatus` to return `{ shell, aiDiagnosis }`; add `requestAiDiagnosis`. Update `SyncStateService.refreshReportServerStatus` return shape.
- [x] T12. Add `executionAiDiagnosis` and `supervisorAiDiagnosis` to `TagWiseApp` ready state. Add `mapAiDiagnosisProjection` helper. Add `handleRequestExecutionAiDiagnosis`. Update `handleRefreshExecutionReportServerStatus` and `handleOpenSupervisorReviewReport` to capture the AI projection.
- [x] T13. Pass `executionAiDiagnosis`, `supervisorAiDiagnosis`, `onRequestExecutionAiDiagnosis` as props on `VisualProductShell`. Thread them into the two `useMemo` projection sites.
- [x] T14. Add the `Solicitar diagnostico assistido` Pressable inside `ServiceReportScreen`. Update screen prop type.
- [x] T15. C-02: `validateOptionalPhotoMetadata` + mobile `maxLength`.
- [x] T16. Update test fixtures across the codebase that construct `ReportSubmissionStatusResponse` / `SupervisorReviewReportDetail` / mobile mock api clients to include the new fields.
- [x] T17. Validation
  - [x] `cd backend && npx tsc --noEmit` — silent (PASS).
  - [x] `cd backend && npm test` — **99 / 100 PASS + 1 skipped** (was 92 + 1; +7 new tests).
  - [x] `cd mobile && npx tsc --noEmit` — silent (PASS).
  - [x] `cd mobile && npm test` — **186 / 186 PASS** (unchanged from 8.8 baseline).
  - [ ] Manual phone smoke after the full software loop is done.

## Dev Notes

### Why deferred C-01 (NetInfo)

The QA Pass 2 report flagged that the `AppState`-only regain trigger does not fire when the network is restored while the app remains in the foreground. The fix is NetInfo. Installing it requires:
- `npm install @react-native-community/netinfo`
- An Expo config update (autolinking is fine but the native module needs to be in the build)
- A native rebuild (the user is on EAS Build with a 4-terminal workflow)

Since the user's iteration loop is software-only until the final APK rebuild, pulling in NetInfo here costs an extra rebuild later. The existing `Atualizar status do servidor` button on the report screen + the `Tentar novamente` chip on the sync section together cover the in-app drop-and-recover scenario manually. The NetInfo wiring is queued as a small follow-up story (Story 8.10 or a dedicated 8.x bug-fix), pre-tested in software before the next APK.

### AI provider environment

The backend already had the AI provider boundary (`createAiDiagnosisProvider`) wired against `environment.ai` from Story 7.5. The default config is `mock` (no external calls). To exercise OpenAI in production, set `TAGWISE_AI_ENABLED=true`, `TAGWISE_AI_PROVIDER=openai`, `OPENAI_API_KEY=...`, `OPENAI_MODEL=...`. (Story 8.12 correction: the OpenAI vars are `OPENAI_API_KEY` / `OPENAI_MODEL` per `backend/src/config/env.ts:116-117`, not `TAGWISE_AI_OPENAI_*`.)

### Idempotency

The worker job's idempotency key is `ai-diagnosis.generate-for-report:<ownerUserId>:<reportId>:<requestedAt>` — distinct per request so the user can retry a `failed-nonblocking` row. The repository's upsert ensures we never run two parallel jobs on the same row in the `pending` window (the second `requestForReport` rebinds `last_requested_at` but the existing pending row + job continue).

### State machine

```
       ┌───────────────────────────────────────┐
       │  (no row)                              │
       │   state='unavailable' on projection    │
       └────────────────┬──────────────────────┘
                        │  requestForReport
                        ▼
                  ┌───────────┐
                  │  pending  │◀──┐
                  └─────┬─────┘   │  manual re-request from failed-nonblocking
                        │ worker  │
            success     │         │  failure
                        ▼         │
                  ┌───────────┐   │
                  │ available │   │
                  └───────────┘   │
                                  │
                  ┌────────────────────┐
                  │ failed-nonblocking │──┘
                  └────────────────────┘
```

`unavailable` only exists at the projection edge for reports with no row. Once a row is created it's always `pending` / `available` / `failed-nonblocking`.

### Cross-boundary contract risk

The QA Pass 2 report flagged that contract gaps between layers (projection passes test, caller passes test, integration never tested) were the failure mode that produced D-01 and D-02 originally. Story 8.9 mitigates this by:

1. `AiDiagnosisService` tests assert that the worker job is enqueued with the right payload at the right idempotency key.
2. `createAiDiagnosisJobHandler` tests assert that on provider success the row moves to `available` and on provider error the row moves to `failed-nonblocking` AND the error is re-thrown.
3. Backend supervisor projection now embeds `aiDiagnosis`; if a future story removes the field from `ReportSubmissionStatusResult`, supervisor render breaks at typecheck.

A full end-to-end pg-mem integration test (submit a report → wait for worker → status returns 'available') was considered and **explicitly deferred**: it would require bootstrapping a worker loop inside the test, which adds non-trivial complexity. The current unit + service tests prove every boundary in isolation; the phone smoke is the production integration test.

## Validation

### Automated (already run)

```powershell
cd backend
npx tsc --noEmit     # PASS (silent)
npm test -- --run    # 99 pass, 1 skipped (env-gated live API smoke)
                     # was 92 + 1 in Story 8.8; +7 new (5 AI + 2 length validator)

cd ../mobile
npx tsc --noEmit     # PASS (silent)
npm test -- --run    # 186 pass (unchanged from 8.8 baseline)
```

### Manual Phone Smoke Checklist (run after the full software loop is done)

Run on a real Android phone after rebuilding the APK (4-terminal workflow). Backend must be running with `TAGWISE_AI_PROVIDER='mock'` for the mock provider, or `'openai'` + API key for the real one.

| # | Action | Expected |
|---|---|---|
| 1 | Sign in as `tech@tagwise.local`. Open a tag, run a calculation, submit the report. | Submission succeeds (Story 8.7/8.8 unchanged). Server accepts the report. |
| 2 | Open the report screen on the same tag. Scroll to "Diagnostico de IA". | Initial state shows `Pendente` (auto-enqueued at submit). Below the AI section, the button reads "Aguardando diagnostico (toque para reverificar)". |
| 3 | Tap "Atualizar status do servidor" (Story 8.7 button). | AI section refreshes; expected state moves to `Disponivel` with the mock provider's summary text within ~5-10 seconds (worker loop interval). |
| 4 | Submit a SECOND report. On that second report screen, *immediately* tap "Solicitar diagnostico assistido". | The button switches to "Aguardando diagnostico". The state moves to `Disponivel` after the worker runs. |
| 5 | Test offline: airplane mode on. Tap "Solicitar diagnostico assistido". | PT-BR message: "Diagnostico assistido nao disponivel agora: …". Report is unaffected. |
| 6 | Sign out. Sign in as `supervisor@tagwise.local`. Open one of the reports from steps 1-4. | Supervisor review detail shows the AI section reflecting the row's current state. For step-1 / step-4 reports the state is `available` with the assistive summary. |
| 7 | Force a provider error (set `OPENAI_API_KEY=invalid` in terminal 2 + terminal 3, restart). Submit a new report. | After the worker runs (and retries within budget), the AI section shows `failed-nonblocking` with the provider's actual failure reason surfaced by Story 8.12 (e.g. "OpenAI diagnosis request failed with status 401."). **Report submission is unaffected.** |
| 8 | Attach a photo and enter a 2500-char observation in the technician note editor. | Mobile TextInput stops accepting input at 2000 chars (maxLength). If the technician somehow submits longer, backend rejects with `malformed-report-payload` — report stays in local queue with the structured error visible. |

If any step fails, document which step and what was observed.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (Amelia persona), bmad-agent-dev skill, 2026-05-14.

### Debug Log References

- `cd backend && npx tsc --noEmit` — PASS (silent).
- `cd backend && npm test -- --run` — **99 / 100 PASS + 1 skipped** (was 92 + 1 in Story 8.8; +7 new: 5 AI service/handler + 2 length validator).
- `cd backend && npm test -- --run aiDiagnosisService` — 5/5 PASS in 208ms.
- `cd backend && npm test -- --run reportSubmissionService` — 4/4 PASS in 200ms.
- `cd mobile && npx tsc --noEmit` — PASS (silent).
- `cd mobile && npm test -- --run` — 186 / 186 PASS in ~2s (unchanged from 8.8 baseline).

### Completion Notes

- **No SQL data hazard.** The `ai_diagnoses` table is keyed by `(owner_user_id, report_id)` with FK to `report_submission_records` and `ON DELETE CASCADE`. Existing report rows do not need backfill — missing AI rows project as `'unavailable'` by default.
- **Worker idempotency.** Every manual request uses a new `last_requested_at` (the idempotency key includes it), so successive taps on the manual button enqueue new jobs only when the prior request resolved. The repository's upsert ensures the existing row's `available` status is never overwritten by a stale pending state.
- **AI is non-blocking everywhere.** Three explicit guards: (1) `submitForValidation` catches the enqueue error in `enqueueAiDiagnosisAfterAcceptance`; (2) the worker handler always moves the row to `failed-nonblocking` before re-throwing; (3) the mobile handler wraps the API call in try/catch and surfaces a PT-BR non-blocking message.
- **C-02 length validation.** Backend caps `contextNote` at 500 and `technicianNote` at 2000 chars. Mobile mirrors with `maxLength={2000}` on the TextInput. Backend response on overflow is `400` + `reasonCode: 'malformed-report-payload'`.
- **C-01 explicitly deferred.** The `AppState` foreground trigger from Story 8.8 remains. The full NetInfo wiring is queued for a future story to avoid an unnecessary native rebuild in this iteration loop.
- **Fixture updates.** The widened `ReportSubmissionStatusResponse` / `SupervisorReviewReportDetail` types broke five test fixtures across `evidenceUploadOrchestrator.test.ts`, `syncStateService.test.ts`, `supervisorReviewService.test.ts` (mobile), and `serviceBackedReview.test.ts`. All updated to include `aiDiagnosis: { state: 'unavailable', … }` as the safe default. Mobile API client mock fixtures also include `requestAiDiagnosis: vi.fn()`.
- **API service wiring.** `api/main.ts` now constructs `aiDiagnosisService` from `aiDiagnosisRepository` + `workerJobRepository` + `reportSubmissionRepository` + `assignedWorkPackageService`, passes it into the `ReportSubmissionService` constructor (with an `onAiEnqueueError` log callback) and the supervisor/manager services. `worker/main.ts` registers the new job handler alongside the legacy `ops.restart-drill`.

### File List

Added:

- `backend/src/modules/ai-diagnosis/aiDiagnosisRepository.ts`
- `backend/src/modules/ai-diagnosis/aiDiagnosisService.ts`
- `backend/src/modules/ai-diagnosis/aiDiagnosisJobHandler.ts`
- `backend/src/modules/ai-diagnosis/aiDiagnosisService.test.ts` (5 tests)

Modified backend:

- `backend/src/platform/db/migrations.ts` — `0014_ai_diagnoses` migration.
- `backend/src/platform/db/migrations.test.ts` — schema version → 14 + ai_diagnoses table assertion.
- `backend/src/modules/ai-diagnosis/model.ts` — `AiDiagnosisRecord`, `AiDiagnosisRecordState`, `AiDiagnosisRequestSource`, `AiDiagnosisServiceError`.
- `backend/src/modules/report-submissions/model.ts` — `ReportSubmissionAiDiagnosisState`, `ReportSubmissionAiDiagnosisProjection`, `ReportSubmissionStatusResult.aiDiagnosis`.
- `backend/src/modules/report-submissions/reportSubmissionService.ts` — `ReportSubmissionServiceOptions`, auto-enqueue on acceptance, `getReportStatus` reads AI row, exported `toAiDiagnosisProjection` helper, `validateOptionalPhotoMetadata` (C-02), `CONTEXT_NOTE_MAX_LENGTH` / `TECHNICIAN_NOTE_MAX_LENGTH` constants.
- `backend/src/modules/report-submissions/reportSubmissionService.test.ts` — 2 new length-validation tests.
- `backend/src/modules/review/model.ts` — `SupervisorReviewReportDetail.aiDiagnosis`.
- `backend/src/modules/review/supervisorReviewService.ts` — optional `aiDiagnosisService` injection on `SupervisorReviewService` and `ManagerReviewService`; `toReportDetail` accepts AI projection.
- `backend/src/api/createApiRequestHandler.ts` — new `POST /reports/:reportId/ai-diagnosis/request` endpoint + `aiDiagnosisService` dependency.
- `backend/src/api/main.ts` — wires `AiDiagnosisRepository`, `AiDiagnosisService`, `WorkerJobRepository`; passes into `ReportSubmissionService` / `SupervisorReviewService` / `ManagerReviewService` / `createApiRequestHandler`.
- `backend/src/worker/main.ts` — registers `createAiDiagnosisJobHandler` alongside `ops.restart-drill`.

Modified mobile:

- `mobile/src/features/sync/evidenceUploadApiClient.ts` — `ReportSubmissionAiDiagnosisState`, `ReportSubmissionAiDiagnosisProjection`, `AiDiagnosisRequestResponse`, `ReportSubmissionStatusResponse.aiDiagnosis`, `requestAiDiagnosis` method + fetch impl.
- `mobile/src/features/sync/evidenceUploadOrchestrator.ts` — `refreshReportServerStatus` returns `ReportSubmissionAiDiagnosisProjection | null`; new `requestAiDiagnosis` method.
- `mobile/src/features/sync/evidenceUploadOrchestrator.test.ts` — fixture: api client mock now includes `requestAiDiagnosis`; `getReportSubmissionStatus` fixture carries `aiDiagnosis`.
- `mobile/src/features/sync/syncStateService.ts` — `refreshReportServerStatus` returns `{ shell, aiDiagnosis }`.
- `mobile/src/features/sync/syncStateService.test.ts` — fixtures: `refreshReportServerStatus` mock returns `null`; assertion updated to `refreshed.shell.report`.
- `mobile/src/features/review/model.ts` — `SupervisorReviewAiDiagnosisState`, `SupervisorReviewAiDiagnosisProjection`, `SupervisorReviewReportDetail.aiDiagnosis`.
- `mobile/src/features/review/supervisorReviewService.test.ts` — manager detail fixture includes `aiDiagnosis`.
- `mobile/src/features/visual-shell/serviceBackedReview.test.ts` — fixture includes `aiDiagnosis`.
- `mobile/src/shell/TagWiseApp.tsx` — `executionAiDiagnosis` / `supervisorAiDiagnosis` ready-state fields; `mapAiDiagnosisProjection` helper; `handleRequestExecutionAiDiagnosis` handler; `handleRefreshExecutionReportServerStatus` updated to consume new return shape; `handleOpenSupervisorReviewReport` captures AI projection from the supervisor response; `onRequestExecutionAiDiagnosis` prop on `VisualProductShell`.
- `mobile/src/shell/VisualProductShell.tsx` — prop types for `executionAiDiagnosis` / `supervisorAiDiagnosis` / `onRequestExecutionAiDiagnosis`; threads them into both `useMemo` projection sites; `ServiceReportScreen` accepts `onRequestExecutionAiDiagnosis`; manual AI Pressable inside the AI section of the report; mobile `TextInput` `maxLength={2000}` for technician note (C-02).

Deleted: none.

### Story 8.9 Finding-to-Fix Summary

| # | QA Pass 2 Defect / Concern | Status |
|---|---|---|
| D-01 | AI diagnosis end-to-end disconnected | **Fixed** — migration + repo + service + worker handler + auto-enqueue + manual endpoint + supervisor projection + technician status + mobile threading + manual UI. |
| C-01 | AppState-only regain misses in-app network restore | **Deferred** with rationale (NetInfo requires a new native dep + Expo rebuild; user's iteration loop is software-only until final APK; existing manual retry buttons cover the in-app case). |
| C-02 | Backend did not validate `contextNote` / `technicianNote` length | **Fixed** — `validateOptionalPhotoMetadata` + mobile `maxLength={2000}` + 2 new tests. |

## References

- [QA Pass 2 defect discovery report](../planning-artifacts/qa-defect-discovery-2026-05-14-pass-2.md) — defect input
- [QA Pass 1 defect discovery report](../planning-artifacts/qa-defect-discovery-2026-05-14.md) — original D-01 listing
- [Story 8.8 implementation artifact](8-8-evidence-three-context-vertical-layout-and-connectivity-regain.md) — predecessor (8.7 → 8.8 → 8.9 chain)
- [Live phone 8.6 regression analysis](../planning-artifacts/live-phone-story-8-6-regression-root-cause-analysis.md) — original AI-disconnected architectural diagnosis
