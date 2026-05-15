# TagWise QA Defect Discovery Report — Pass 3 (Story 8.9 re-verification)

- **Date:** 2026-05-14
- **Author:** QA re-verification pass after Story 8.9
- **Predecessor:** [`qa-defect-discovery-2026-05-14-pass-2.md`](qa-defect-discovery-2026-05-14-pass-2.md) — Pass 2 (Story 8.8 verification)
- **Source of truth:** Story 8.9 implementation artifact (`_bmad-output/implementation-artifacts/8-9-ai-diagnosis-end-to-end-and-length-validation.md`), current mobile + backend code at HEAD, automated test suite.
- **Intent:** Re-verify D-01 (AI diagnosis end-to-end), C-02 (length validation), C-01 deferral rationale, and confirm Story 8.7 + 8.8 guardrails are intact. The user has explicitly chosen software-only iteration until all stories are done; this report is the gate for "next implementation" vs "APK rebuild + phone smoke."

---

## 1. Verdict

**Pass with concerns — recommend APK rebuild + phone smoke next.**

All 26 verification points from the Pass 3 brief check out at the code level. Story 8.9 (D-01 + C-02) is structurally sound; Story 8.7 + 8.8 guardrails are intact. The four risks the dev acknowledged (C-01 deferred / no end-to-end pg-mem integration test / no clear-and-re-request UI / no supervisor-side manual button) are no worse than stated.

Two **minor non-blocking** observations carry forward:

- **N-01 (minor):** `handleRefreshSupervisorReviewQueue` resets `executionAiDiagnosis: null` and `supervisorAiDiagnosis: null` alongside the supervisor queue reset. Behaviorally harmless because the handler only fires in supervisor/manager mode where `executionShell` is always null; flagged so a future refactor preserves intent.
- **N-02 (documentation precision):** The manual AI endpoint is documented as "accepts technician or supervisor users (any role with auth)" but the service scopes by `user.id` (only the report owner gets a hit; other roles get 404). Not a security defect — at worst a 404 — but the documentation should reflect reality.

One **verified gap** that the dev already acknowledged:

- **A-01 (acknowledged):** No backend test asserts that `submitForValidation` actually calls `aiDiagnosisService.requestForReport` after acceptance. Unit tests cover each side of the boundary individually; the auto-enqueue wire is only verified by typecheck. Phone smoke is the production integration test.

The recommendation in §8 is **APK rebuild + phone smoke now**, with Story 8.10 (data depth) optional and can wait until after the phone confirms the 8.7+8.8+8.9 stack works end-to-end on a real device.

---

## 2. Per-deliverable verdict matrix

### D-01 — AI diagnosis end-to-end

| # | Item | Verdict | Key citation |
|---|---|---|---|
| 1 | Migration `0014_ai_diagnoses` (PK, CHECK, FK cascading, indexes) | **FIXED** | [migrations.ts:392-426](backend/src/platform/db/migrations.ts#L392-L426); migrations test updated to 14 |
| 2 | `AiDiagnosisRepository` upsert idempotency + state mutation correctness | **FIXED** | [aiDiagnosisRepository.ts:74-175](backend/src/modules/ai-diagnosis/aiDiagnosisRepository.ts#L74-L175) — `available` is terminal in upsert; `markAvailable` clears `failure_reason`; `markFailedNonblocking` preserves prior `summary`/`detail`/`generatedAt`; parser handles string + object JSON forms |
| 3 | `AiDiagnosisService.requestForReport` 3 paths (enqueue / no-op when available / 404) | **FIXED** | [aiDiagnosisService.ts:48-111](backend/src/modules/ai-diagnosis/aiDiagnosisService.ts#L48-L111) — upserts pending BEFORE enqueueing; early-returns without enqueue when `state === 'available'`; idempotency key includes `requestedAt` |
| 4 | Worker handler success/failure paths + retry semantics + non-Error guard | **FIXED** | [aiDiagnosisJobHandler.ts:25-81](backend/src/modules/ai-diagnosis/aiDiagnosisJobHandler.ts#L25-L81) — provider success → markAvailable; provider failure → markFailedNonblocking + re-throw; `throw error instanceof Error ? error : new Error(failureReason)` line guards string throws; worker registered in [worker/main.ts](backend/src/worker/main.ts) alongside `ops.restart-drill` |
| 5 | Auto-enqueue on submitForValidation (both insert + replace paths; getReportStatus is read-only) | **FIXED** | [reportSubmissionService.ts:67-138](backend/src/modules/report-submissions/reportSubmissionService.ts#L67-L138) — both acceptance paths call `enqueueAiDiagnosisAfterAcceptance`; catch never re-throws; `getReportStatus` only reads |
| 6 | Manual endpoint `POST /reports/:reportId/ai-diagnosis/request` (auth, 503/4xx/5xx, structured logging) | **FIXED** | [createApiRequestHandler.ts:519-581](backend/src/api/createApiRequestHandler.ts#L519-L581); URL matches mobile client exactly |
| 7 | `SupervisorReviewReportDetail.aiDiagnosis` + `ReportSubmissionStatusResult.aiDiagnosis` (both required fields; supervisor and manager services accept optional AI service) | **FIXED** | [review/model.ts](backend/src/modules/review/model.ts); [supervisorReviewService.ts:38-310](backend/src/modules/review/supervisorReviewService.ts#L38-L310); `toReportDetail` requires 3 args (typecheck guarantees) |
| 8 | Mobile API client widening (`ReportSubmissionStatusResponse.aiDiagnosis` required; `requestAiDiagnosis` method + fetch impl) | **FIXED** | [evidenceUploadApiClient.ts:153-202, 281-293](mobile/src/features/sync/evidenceUploadApiClient.ts#L153-L293); URL `/reports/:id/ai-diagnosis/request` matches backend |
| 9 | `SyncStateService.refreshReportServerStatus` returns `{ shell, aiDiagnosis }`; offline branch returns `{ shell, aiDiagnosis: null }` | **FIXED** | [syncStateService.ts:211-236](mobile/src/features/sync/syncStateService.ts#L211-L236); single caller in `TagWiseApp.tsx` consumes the new shape correctly |
| 10 | Mobile state init (`executionAiDiagnosis` + `supervisorAiDiagnosis` null at every spread/reset site); handlers catch errors and surface PT-BR | **FIXED** | [TagWiseApp.tsx:341-2408](mobile/src/shell/TagWiseApp.tsx#L341-L2408) — 5 init sites verified; `handleRequestExecutionAiDiagnosis` has full try/catch; `handleRefreshExecutionReportServerStatus` falls back to current state when refresh returns null AI |
| 11 | Projection threading: both `buildVisualReportProjection` and `buildVisualReviewDetailProjection` called with 3 args; useMemo deps include new state | **FIXED** | [VisualProductShell.tsx:415-457](mobile/src/shell/VisualProductShell.tsx#L415-L457) |
| 12 | Manual AI UI: Pressable visible when `state !== 'available'`; label switches for `pending`; prop plumbed end-to-end | **FIXED** | [VisualProductShell.tsx:3901-3913](mobile/src/shell/VisualProductShell.tsx#L3901-L3913); state mapping covers all 4 states |

### C-02 — Length validation

| # | Item | Verdict | Citation |
|---|---|---|---|
| 13 | Backend `validateOptionalPhotoMetadata` (constants, type guards, called after `validateEvidenceArrival`, structured 400 error, 2 new tests) | **FIXED** | [reportSubmissionService.ts:302-327](backend/src/modules/report-submissions/reportSubmissionService.ts#L302-L327); [reportSubmissionService.test.ts:40-96](backend/src/modules/report-submissions/reportSubmissionService.test.ts#L40-L96) |
| 14 | Mobile `TextInput maxLength={2000}` on the technician note editor; `contextNote` intentionally not user-typed | **FIXED** | [VisualProductShell.tsx:4698](mobile/src/shell/VisualProductShell.tsx#L4698) |

### C-01 — Deferral

| # | Item | Verdict | Citation |
|---|---|---|---|
| 15 | Story 8.8 AppState wiring intact | **FIXED** | [TagWiseApp.tsx:429](mobile/src/shell/TagWiseApp.tsx#L429) |
| 16 | Existing manual retry surfaces still wired | **FIXED** | `onRefreshServerStatus` flow + `classifySyncError` chips; secondary AI refresh trigger via the refresh button now also pulls aiDiagnosis (positive side-effect, see N-03 below) |
| 17 | In-app foreground network regain gap acknowledged | **DEFERRED** (per Story 8.9 dev agent record; small follow-up story for NetInfo) |

### Regression — Story 8.7 + 8.8 guardrails

| # | Guardrail | Verdict | Citation |
|---|---|---|---|
| 18 | Submit rule: only `severity === 'submit-block'` blocks | **VERIFIED INTACT** | [sharedExecutionShellService.ts:1379](mobile/src/features/execution/sharedExecutionShellService.ts#L1379) |
| 19 | Per-attachment try/catch | **VERIFIED INTACT** | [evidenceUploadOrchestrator.ts:65-94](mobile/src/features/sync/evidenceUploadOrchestrator.ts#L65-L94) |
| 20 | `classifySyncError` 4 PT-BR classes | **VERIFIED INTACT** | [serviceBackedReport.ts:397-414](mobile/src/features/visual-shell/serviceBackedReport.ts#L397-L414) |
| 21 | Back handler + route history stack | **VERIFIED INTACT** | [VisualProductShell.tsx:342, 568-570](mobile/src/shell/VisualProductShell.tsx#L342-L570) |
| 22 | Story 8.8 contextNote/technicianNote round-trip — fixture values fit C-02 caps | **VERIFIED INTACT** | [evidenceUploadOrchestrator.test.ts:406-410](mobile/src/features/sync/evidenceUploadOrchestrator.test.ts#L406-L410) — `'Ponto de loop 50%'` (17 chars) + `'Loop OK, cabos danificados na flange'` (36 chars) — both well within 500/2000 caps |
| 23 | Instrument-level photos on TagDetailScreen | **VERIFIED INTACT** | [VisualProductShell.tsx:2704](mobile/src/shell/VisualProductShell.tsx#L2704) |
| 24 | Vertical layout variants | **VERIFIED INTACT** | `variant="vertical"` at 5+ priority sites |
| 25 | Demo-shell gating (D-07) | **VERIFIED INTACT** | [model.ts:263](mobile/src/features/visual-shell/model.ts#L263) |
| 26 | PT-BR sweep | **VERIFIED INTACT** | `formatPhotoExecutionStepLabel`, `formatPhotoContextSubtitle`, `reviewLifecycleLabel`, `translateEvidencePresenceState`, `translateEvidencePresenceMessage` all present |

---

## 3. Verified new defects

**None blocking.** Three minor items below — each well-understood, not regressing existing behavior, not worsening the dev's acknowledged risks.

### N-01 — `handleRefreshSupervisorReviewQueue` clears technician AI state

- **Severity:** Minor (cosmetic).
- **Location:** [TagWiseApp.tsx:2322-2324](mobile/src/shell/TagWiseApp.tsx#L2322-L2324)
- **Observation:** The bulk-replace I did when adding `executionAiDiagnosis: null, supervisorAiDiagnosis: null` initialization to state-reset spreads landed inside the supervisor queue refresh too. In supervisor/manager mode `executionShell` is null and `executionAiDiagnosis` should logically also be null, so this reset is a no-op — but it telegraphs the wrong intent if a future story makes a session role-switch possible.
- **Recommendation:** Drop `executionAiDiagnosis: null` from this specific reset (keep only the supervisor-side fields). Defer to a small cleanup along with C-01 NetInfo.

### N-02 — Manual AI endpoint scoping documentation drift

- **Severity:** Documentation precision.
- **Location:** [createApiRequestHandler.ts:519-581](backend/src/api/createApiRequestHandler.ts#L519-L581) and the Story 8.9 artifact text "accepts technician or supervisor users (any role with auth)"
- **Observation:** The endpoint authenticates but does NOT enforce role. The downstream service (`AiDiagnosisService.requestForReport`) scopes by `user.id` via `reportSubmissionRepository.getByReportId(user.id, reportId)`. Practical effect: only the report owner (technician) can manually request AI; supervisors/managers calling this endpoint for someone else's report get a clean 404 (no privilege escalation possible). The artifact text is loose but the security posture is fine.
- **Recommendation:** Tighten the artifact wording to "any authenticated user — the service scopes by report owner, so only the technician who owns the report can manually request AI." No code change.

### N-03 — Positive secondary trigger (not a defect)

- **Location:** [TagWiseApp.tsx:2150-2234](mobile/src/shell/TagWiseApp.tsx#L2150-L2234)
- **Observation:** The Story 8.7 "Atualizar status do servidor" button now transitively refreshes the AI projection (via `syncStateService.refreshReportServerStatus` returning `{ shell, aiDiagnosis }`). This is a free secondary trigger for AI updates without requiring the manual "Solicitar diagnostico assistido" button.
- **Action:** None — flagging as a positive observation worth keeping in mind for the phone smoke.

---

## 4. Unverified suspicions (need phone or live backend)

| # | Item | What a phone smoke would prove |
|---|---|---|
| U-01 | Auto-enqueue at submit actually fires in production | The dev artifact acknowledges no unit test for this path; the phone smoke step where the technician submits and then sees AI move from `pending` → `available` is the integration test |
| U-02 | Worker actually picks up the new job type | Worker registration is verified at code level but the worker loop firing the AI handler in production requires the worker process running with the new build |
| U-03 | OpenAI provider path (when not using mock) | Mock provider runs deterministically in unit tests; the real OpenAI provider integration is unverified without a backend running with valid keys and a real API call |
| U-04 | Supervisor visibility of `aiDiagnosis` field on a real report | The supervisor-detail end-to-end flow (auto-enqueue at submit → worker runs → supervisor opens detail → sees AI section) is only verified piecewise; the phone-to-phone round-trip confirms it |
| U-05 | Length validator on a real malformed mobile submission | The validator path is unit-tested; the actual mobile TextInput maxLength + backend rejection flow on a real device is not |
| U-06 | C-01 in-app regain gap is acceptable in practice | The user's testing scenario will tell us whether the "phone keeps app in foreground while network drops/recovers" is rare enough to defer NetInfo, or whether it bites him repeatedly |

---

## 5. Regression risk list for next implementation

Whatever follows Story 8.9 must preserve:

1. **AI is always non-blocking.** Any change that adds a "halt report on AI failure" path is a product regression. Specifically: do not add AI status to `submitReadiness === 'blocked'`; do not add AI to `buildSubmitBlockingHooks`.
2. **Auto-enqueue error path must remain silent.** `enqueueAiDiagnosisAfterAcceptance` catches every error and calls `onAiEnqueueError`. Do not change this to re-throw.
3. **Worker handler re-throw contract.** `createAiDiagnosisJobHandler.handle` must continue to re-throw after `markFailedNonblocking` so the worker can retry within its budget. Do not switch to silent failure.
4. **`toReportDetail`'s required third arg.** The signature is required (not optional) — that's intentional. Future stories that add a new review path must pass an `aiDiagnosis` projection.
5. **URL match between mobile client and backend endpoint.** Both use `/reports/:reportId/ai-diagnosis/request` (NOT under `/sync/...`). Any change on either side must update both.
6. **`refreshReportServerStatus` return shape.** Now `{ shell, aiDiagnosis }`. Adding more fields is fine; changing existing fields breaks `TagWiseApp` consumption.
7. **Story 8.8 `contextNote` / `technicianNote` round-trip fixture values.** Story 8.10 (or any seed enrichment) must keep fixture string lengths well under 500/2000 chars, otherwise the C-02 validator will reject them.
8. **Demo-shell gating (`isDemoShell`).** Authenticated render paths still consume service-backed projections; demo literals only build when `!authenticated && demoEnabled`. Don't reintroduce unconditional demo data.

---

## 6. Recommended next BMAD step

**Recommend APK rebuild + 4-terminal phone smoke now.** Story 8.10 (data depth) is optional and can come after.

Rationale:

- The slice you authorized (Stories 8.7 + 8.8 + 8.9) is now functionally complete at the code level: the workflow runs technician → AI → supervisor end-to-end; UX gaps from manual findings 1-12 are closed; D-01 through D-07 are all addressed.
- Three rounds of QA code-level inspection (Pass 1 surfaced 7 defects; Pass 2 verified Story 8.8 fixed 6 of them; Pass 3 verifies Story 8.9 fixed the seventh) have not surfaced anything that demands a Story 8.9.x patch.
- The remaining uncertainty (U-01 through U-06) is exactly the class of risk a phone smoke is built to cover. Continuing software-only iteration without a phone test is the exact failure pattern Winston flagged in the 8.6 root-cause analysis ("code green, phone red").
- Story 8.10 (prior-`Report` records, prior approval decisions in seed) is **isolated** — it adds backend records and does not change any flow. If the phone test reveals a bug, you can address it in a Story 8.9.x patch BEFORE running 8.10. Better to know what's broken from the phone test before adding more code on top.

### If you choose to continue software-only

Story 8.10 — seed data depth — would be a half-day:

1. New prior-`Report` entities seeded against PT-101 / TT-205 / AI-330 / LT-410 / XV-402 (one per tag, with measured values + technician comments + photo references). Reuses the existing `ReportSubmissionRepository.insertAcceptedOrGetExisting`.
2. New prior approval-decision audit events seeded so the supervisor sees a non-empty history timeline.
3. Optional: bundle the C-01 NetInfo install (1 native dependency, 1 listener) so the in-app regain gap closes before the phone test.

### If the phone smoke surfaces issues

The expected fix sites:
- AI not appearing on supervisor side → check the worker actually processes the new job type (check worker logs).
- AI auto-enqueue not firing → check `api/main.ts` actually passes the AI service into `ReportSubmissionService` constructor.
- Manual button not visible / not tappable → check `executionAiDiagnosis` state propagates through `buildVisualReportProjection`.
- Length validator rejecting legitimate notes → check the fixture data; raise caps if needed.

---

## 7. Validation performed

### Commands run

```powershell
cd c:/Users/emili/Desktop/Projets/TagWise4to20/backend; npm test -- --run
cd c:/Users/emili/Desktop/Projets/TagWise4to20/mobile;  npm test -- --run
cd c:/Users/emili/Desktop/Projets/TagWise4to20/mobile;  npm test -- --run evidenceUploadOrchestrator
cd c:/Users/emili/Desktop/Projets/TagWise4to20/backend; npm test -- --run migrations
```

### Test results

- Backend full: **99 pass / 1 skipped** (env-gated TagWise live API smoke). Unchanged from Story 8.9 dev baseline.
- Mobile full: **186 / 186 PASS**. Unchanged from Story 8.8 baseline (Story 8.9 added no mobile tests; only changed wiring).
- Mobile orchestrator targeted: **11 / 11 PASS** in 628ms — the Story 8.8 round-trip test still works under the C-02 caps.
- Backend migrations targeted: **2 / 2 PASS** in 427ms — schema version 14 + ai_diagnoses table presence asserted.

### Code paths re-inspected during this pass

- `backend/src/platform/db/migrations.ts` (`0014_ai_diagnoses` migration + index)
- `backend/src/platform/db/migrations.test.ts` (schema version, applied IDs, table presence)
- `backend/src/modules/ai-diagnosis/aiDiagnosisRepository.ts` (`upsertPending`, `markAvailable`, `markFailedNonblocking`, `getByReportId`)
- `backend/src/modules/ai-diagnosis/aiDiagnosisService.ts` (`requestForReport`, `buildDiagnosisInput`, idempotency key)
- `backend/src/modules/ai-diagnosis/aiDiagnosisService.test.ts` (5 cases)
- `backend/src/modules/ai-diagnosis/aiDiagnosisJobHandler.ts` (payload parse, success/failure, non-Error guard)
- `backend/src/worker/main.ts` (handler registration)
- `backend/src/modules/report-submissions/reportSubmissionService.ts` (auto-enqueue paths, getReportStatus, toAiDiagnosisProjection, length validator)
- `backend/src/modules/report-submissions/reportSubmissionService.test.ts` (4 cases — 2 new for C-02)
- `backend/src/modules/review/supervisorReviewService.ts` (constructor 4th arg, detail fetch, `toReportDetail` 3-arg signature)
- `backend/src/modules/review/model.ts` (`SupervisorReviewReportDetail.aiDiagnosis`)
- `backend/src/api/createApiRequestHandler.ts` (manual endpoint + role/auth path)
- `backend/src/api/main.ts` (AI service wiring through constructors)
- `mobile/src/features/sync/evidenceUploadApiClient.ts` (DTO + fetch impl + URL)
- `mobile/src/features/sync/evidenceUploadOrchestrator.ts` (return shape + `requestAiDiagnosis`)
- `mobile/src/features/sync/syncStateService.ts` (return shape)
- `mobile/src/features/review/model.ts` (supervisor DTO mirror)
- `mobile/src/shell/TagWiseApp.tsx` (state init at 5 sites, 3 handlers, prop wiring, helper)
- `mobile/src/shell/VisualProductShell.tsx` (projection threading, `ServiceReportScreen` prop, manual Pressable)
- All `.test.ts` fixtures that consume the widened types — `evidenceUploadOrchestrator.test.ts`, `syncStateService.test.ts`, `serviceBackedReview.test.ts`, `supervisorReviewService.test.ts` — every fixture confirmed to carry `aiDiagnosis`

### Limitations

- **No phone test.** Per your explicit choice. The 6 unverified suspicions (U-01 to U-06 in §4) require a real device or a running backend.
- **No live backend round-trip test.** A pg-mem end-to-end "submit → worker loop → status" integration test was deferred by the dev for the same reason — bootstrapping a worker loop inside the test adds complexity disproportionate to the slice value.
- **No renderer tests.** Story 8.7-onwards has deferred `@testing-library/react-native`; this remains the case.

---

## Cross-references

- [QA Pass 1](qa-defect-discovery-2026-05-14.md) — original defect list
- [QA Pass 2](qa-defect-discovery-2026-05-14-pass-2.md) — Story 8.8 verification
- [Story 8.9 implementation artifact](../implementation-artifacts/8-9-ai-diagnosis-end-to-end-and-length-validation.md)
- [Story 8.8 implementation artifact](../implementation-artifacts/8-8-evidence-three-context-vertical-layout-and-connectivity-regain.md)
- [Story 8.7 implementation artifact](../implementation-artifacts/8-7-live-phone-field-workflow-repair.md)
- [Live phone 8.6 regression analysis](live-phone-story-8-6-regression-root-cause-analysis.md)

---

## Closing note

Three QA cycles of code-level inspection have done their job: Pass 1 found seven defects, Pass 2 cleared six of them, Pass 3 clears the seventh. The remaining unknowns are device-level integration risks that only a phone test can answer. The right move now is to rebuild the APK once and run the consolidated 8.7+8.8+8.9 smoke checklist on your phone. Story 8.10 (data depth) and the C-01 NetInfo deferred work can both wait until after that smoke confirms the foundation holds — there's no point adding more code on top of a stack we haven't proven on a real device yet.

Recommend: **APK rebuild + 4-terminal phone smoke.**
