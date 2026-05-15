# TagWise QA Defect Discovery Report — 2026-05-14

- **Author:** QA exploratory pass (code/test/manual-hypothesis triangulation)
- **Scope:** Independent verification of 5 user-reported hypothesis areas after the post-Story-8.7 APK build
- **Source-of-truth used:** PRD, architecture, story map, Story 8.6/8.7 implementation artifacts, current mobile + backend code at HEAD (commit `4e2a521`), automated test suite (180/180 mobile, 92/93 backend with one env-gated skip)
- **Intent:** Produce verified defect material for BMAD SM/PO to draft the next implementation story. **No implementation in this artefact.**

---

## 1. Verdict

**Needs fixes.**

The Story 8.7 hotfix landed cleanly at the unit-test layer. The intended flow (`tag → context → calculation → history → diagnosis → checklist → report → approval → sync`) is structurally present and exercised by the test suite. However, three of the five user hypotheses are confirmed defects at the code level, one is a confirmed UX-layout regression, and one (data realism) is borderline — adequate breadth, missing depth.

Two of the confirmed defects are **product-shape defects, not UX nits**: AI diagnosis is end-to-end disconnected (mobile, backend worker, and supervisor API), and per-photo execution context (`contextNote`) is captured locally but dropped at the backend submission boundary. Neither is catchable by the current test suite because the suite verifies projection functions and service shapes in isolation, not their cross-boundary wiring.

| Hypothesis | Status |
|---|---|
| H1 — Seed/demo data weak | Partial (breadth OK, depth missing) |
| H2 — AI diagnosis flow wrong/missing | **Confirmed — critically incomplete** |
| H3 — Evidence/photo flow placement | **Confirmed — instrument-level missing; backend drops contextNote; supervisor cannot see context** |
| H4 — Horizontal TITLE/VALUE layout regression | **Confirmed — multiple user-visible screens** |
| H5 — Recent change regressions | Mostly OK (10 of 11 areas) + 1 confirmed dead-code gap on offline-regain auto-retry |

---

## 2. Verified Defects

### D-01 — AI diagnosis pipeline never produces a result (end-to-end dead)

| Field | Detail |
|---|---|
| Severity | **Blocking** for the AI assistive promise; not blocking for the deterministic critical path |
| Area | AI |
| Expected | AI diagnosis is assistive and non-blocking. Manual trigger from technician, or queued at submission/approval handoff. Backend job runs server-side. Supervisor sees `available` / `pending` / `unavailable` / `failed-nonblocking`. |
| Actual | (a) Mobile callers of `buildVisualReportProjection` and `buildVisualReviewDetailProjection` both omit the optional `aiDiagnosis` parameter, so the AI section is hardcoded to `unavailable` for every report on every device. (b) Backend worker registers exactly one job handler (`ops.restart-drill`) — no `ai-diagnosis.*` handler exists. (c) `reportSubmissionService.submitForValidation` never enqueues an AI job. (d) Backend `SupervisorReviewReportDetail` model has no `aiDiagnosis` field. (e) No HTTP route under `backend/src/api/main.ts` exposes a "request AI diagnosis" endpoint. (f) The mobile UI surface that the architect described as "manual AI button" does not exist on any screen. |
| Reproduction (code-path inspection) | 1) Open [VisualProductShell.tsx:388-391](mobile/src/shell/VisualProductShell.tsx#L388-L391) — `buildVisualReportProjection(executionShell, reportSyncDetail)` (no 3rd arg). 2) Open [serviceBackedReport.ts:101-105](mobile/src/features/visual-shell/serviceBackedReport.ts#L101-L105) — signature accepts optional `aiDiagnosis`. With `undefined`, `buildVisualAiDiagnosisProjection(undefined)` returns `state: 'unavailable'`. 3) Open [VisualProductShell.tsx:416-419](mobile/src/shell/VisualProductShell.tsx#L416-L419) — same omission for `buildVisualReviewDetailProjection`. 4) Open [backend/src/worker/main.ts:23-36](backend/src/worker/main.ts#L23-L36) — only `ops.restart-drill` registered. 5) Grep `aiDiagnosis` across `backend/src/modules/report-submissions` → 0 hits; across `backend/src/modules/review` → 0 hits except provider boundary in `modules/ai-diagnosis/`. |
| Files / components | `mobile/src/shell/VisualProductShell.tsx` (memo wiring), `mobile/src/features/visual-shell/serviceBackedReport.ts`, `mobile/src/features/visual-shell/serviceBackedReview.ts`, `mobile/src/features/diagnostics/*`, `backend/src/worker/main.ts`, `backend/src/modules/report-submissions/`, `backend/src/modules/review/model.ts`, `backend/src/modules/ai-diagnosis/*` (provider boundary present but unused) |
| Evidence | Story 7.5 ("AI Provider Readiness Boundary") delivered the provider abstraction (mock + OpenAI). Stories 8.4 and 8.7 produced the mobile projection shapes (`buildVisualAiDiagnosisProjection`, AI section in report / review). Nothing connected the two. Confirmed by direct file reads above and by `cd backend && rg aiDiagnosis src/modules/{report-submissions,review}` returning zero matches. |
| Mobile secrets check | Pass. `rg -i 'openai\|anthropic\|sk-\|apiKey' mobile/src` returns no provider tokens. The boundary is in the right service. |
| Recommended fix direction | (i) Define a worker job type `ai-diagnosis.generate-for-report` and register a handler in the worker that pulls `report.id`, calls the provider via `AiDiagnosisProviderFactory`, and writes the result to a new `ai_diagnoses` table keyed by `report_id`. (ii) Enqueue that job inside `reportSubmissionService.submitForValidation` after the lifecycle transition. (iii) Add `aiDiagnosis: AiDiagnosisProjection \| null` to `SupervisorReviewReportDetail` and join the new table in the supervisor query. (iv) Thread the value into the two mobile projection sites at `VisualProductShell.tsx:388` and `:416`. (v) Add a manual "Solicitar diagnóstico assistido" Pressable on the report screen that posts `POST /reports/:id/ai-diagnosis/request` — the same backend endpoint also runs at submission time, so the manual button just short-circuits the wait. (vi) All four states (`available`/`pending`/`unavailable`/`failed-nonblocking`) must surface in supervisor review with `blocking: false`. |

### D-02 — `contextNote` is captured locally but dropped at backend submission boundary

| Field | Detail |
|---|---|
| Severity | **High** |
| Area | Evidence |
| Expected | Per-photo execution-step context (`Ponto de loop 50%`, `Checklist`, etc.) round-trips from mobile capture → local store → submission payload → backend persistence → supervisor review. |
| Actual | Mobile captures `contextNote` and persists it in SQLite (`StoredExecutionPhotoAttachmentPayload` parser at [sharedExecutionShellService.ts:438-439](mobile/src/features/execution/sharedExecutionShellService.ts#L438-L439)) — verified by Story 8.7's round-trip unit test. But `mobile/src/features/sync/evidenceUploadOrchestrator.ts` builds `ReportSubmissionPhotoAttachment` payloads that contain only `evidenceId`, `serverEvidenceId`, `presenceFinalizedAt`, `syncState`. The backend `ReportSubmissionPhotoAttachment` model in `backend/src/modules/report-submissions/model.ts` has no `contextNote` field. `rg contextNote backend/src` returns 0 hits. |
| Reproduction | 1) Attach a photo at loop point 50% on the live APK. 2) Submit the report when connected. 3) Sign in as supervisor on a separate device. 4) Open the report's evidence list. 5) Observe the photo with no context label. |
| Files / components | `mobile/src/features/sync/evidenceUploadOrchestrator.ts`, `backend/src/modules/report-submissions/model.ts`, `backend/src/modules/review/model.ts` (`SupervisorReviewPhotoAttachment`), `mobile/src/features/review/model.ts` (mobile mirror of the supervisor contract) |
| Evidence | Backend has zero references to `contextNote`. Confirmed by `Grep contextNote backend/src` → 0 files. Mobile review projection (`serviceBackedReview.ts`) does not render `contextNote`. |
| Recommended fix direction | Add `contextNote: string \| null` to both `ReportSubmissionPhotoAttachment` (submission DTO) and `SupervisorReviewPhotoAttachment` (review DTO). Persist on the backend `report_photo_attachments` table. Thread into the supervisor review projection and render under each photo card on `ReviewDetailView` (e.g., as a small subtitle directly under the photo source line). Existing photo subtitles on the technician report screen already render `contextNote` from local state ([serviceBackedReport.ts](mobile/src/features/visual-shell/serviceBackedReport.ts)); the supervisor side must mirror this. |

### D-03 — No photo entry point on the instrument/tag detail screen

| Field | Detail |
|---|---|
| Severity | **High** (per the user's three-context model) |
| Area | Evidence |
| Expected | Photos can be attached from the instrument/tag screen (physical-instrument photos: nameplate, installation, wiring); these are not tied to any test step. |
| Actual | `TagDetailScreen` (around [VisualProductShell.tsx:2488-2632](mobile/src/shell/VisualProductShell.tsx#L2488-L2632)) renders metadata + four action tiles (`Calcular`, `Comparar`, `Diagnosticar`, `Registrar`) but has **zero** photo affordance. Photos can only be attached from `ServiceCalculationScreen`, `LoopExecutionScreen`, `ServiceGuidanceScreen` (test-level), and `ServiceReportScreen` (report-level). |
| Reproduction | Open any tag from the work-package list. Scan the detail screen for `Foto` / `Galeria` / camera button — none exists. |
| Files / components | `mobile/src/shell/VisualProductShell.tsx` (`TagDetailScreen`), `mobile/src/features/execution/model.ts` (model needs `instrument-level` step kind or separate evidence record kind) |
| Evidence | Direct read of the detail screen; cross-checked against `ExecutionPhotoActions` usages — only three call sites (calculation, guidance, loop), none on the detail screen. |
| Recommended fix direction | Two options. (a) Cheap: render `ExecutionPhotoActions` with `contextNote: 'Instrumento'` on the detail screen — works once the photo model supports an instrument-level execution step. The current model collapses non-canonical steps to `'guidance'` via `toExecutionStepKind`, so an instrument-level attachment would surface in the wrong slot. (b) Proper: add `'instrument'` to `SharedExecutionStepKind` (or model instrument-level photos as evidence on the tag context itself), then expose `ExecutionPhotoActions` on the detail screen. Either path requires a small evidence-model change, which is why this is high (not medium). |

### D-04 — No per-photo technician comment field

| Field | Detail |
|---|---|
| Severity | **Medium** |
| Area | Evidence |
| Expected | Technician can annotate each photo with a short comment ("Crack visível na flange", "Cabo solto"). The system-set `contextNote` (e.g., `Ponto de loop 50%`) and the technician's free-text observation are different concerns. |
| Actual | `SharedExecutionPhotoAttachment` ([mobile/src/features/execution/model.ts](mobile/src/features/execution/model.ts)) has `contextNote` only. There is no `technicianNote: string \| null` field on the type, no UI input to prompt for one when attaching, and no rendering of one on the report screen or review screen. |
| Files / components | `mobile/src/features/execution/model.ts`, `mobile/src/features/execution/sharedExecutionShellService.ts` (`attachPhotoEvidence`), the three execution screens that render `ExecutionPhotoActions`, the report photo card, the review photo card |
| Recommended fix direction | Add `technicianNote: string \| null` to the in-memory attachment, the persisted payload, the submission DTO, and the supervisor DTO. UI: after attaching, surface a small inline text input under the thumbnail in the report screen so the technician can add a note without leaving the flow. Render under each photo on both technician and supervisor sides. Keep `contextNote` as the system-set sub-step label and `technicianNote` as the free-text observation. |

### D-05 — Horizontal TITLE/VALUE rows on user-visible screens regress Story 8.6's vertical-block intent

| Field | Detail |
|---|---|
| Severity | **Medium** (readability blocker on narrower Android phones; not a flow blocker) |
| Area | UI layout |
| Expected | Important info blocks render vertically: label on one line, value below, full width — so long values (timestamps, long IDs, multi-word lifecycle labels, sync detail strings) do not wrap mid-row or truncate. |
| Actual | The codebase has both patterns. `ReportSummaryBlock` ([VisualProductShell.tsx:5055-5062](mobile/src/shell/VisualProductShell.tsx#L5055-L5062)) is vertical. `SummaryLine` ([:5032-5053](mobile/src/shell/VisualProductShell.tsx#L5032-L5053)) and `MetricLine` ([:4972-4987](mobile/src/shell/VisualProductShell.tsx#L4972-L4987)) are horizontal (`flexDirection: 'row'`, fixed-width label, flex value). The horizontal primitives are still used on five user-visible screens. |
| Verified violation sites | (i) **Instrument detail** — `MetricLine` × 6 at [VisualProductShell.tsx:2537-2558](mobile/src/shell/VisualProductShell.tsx#L2537-L2558) for `Faixa`, `Tolerancia`, `Ultimo valor`, `Area`, `Ativo`, `Vencimento`. Long values (asset reference, due date) wrap on small screens. (ii) **Technician report header** — `SummaryLine` × 5 at [:3591-3595](mobile/src/shell/VisualProductShell.tsx#L3591-L3595). The `Sync` row can render strings like `"Sincronizado: aguardando conferencia do supervisor"` next to a 110px label — guaranteed to wrap. (iii) **Supervisor review queue card** — `SummaryLine` × 4 at [:3976-3979](mobile/src/shell/VisualProductShell.tsx#L3976-L3979). `Pacote` values are long ids (e.g. `BP-2025-001-A`). (iv) **Supervisor review detail** — `SummaryLine` × 2 fixed + dynamic at [:4053-4056](mobile/src/shell/VisualProductShell.tsx#L4053-L4056). The dynamic `summaryRows` carry timestamps and reviewer names. (v) **History timeline** — `HistoryRow` style at [:6453-6481](mobile/src/shell/VisualProductShell.tsx#L6453-L6481). |
| Files / components | `mobile/src/shell/VisualProductShell.tsx` — convert `MetricLine` and `SummaryLine` to render vertically at the listed sites, or introduce a new `SummaryBlockRow` that wraps `ReportSummaryBlock` for the consistent-vertical pattern |
| Recommended fix direction | Do **not** delete `SummaryLine` (some legitimate short pairs use it). Add a `variant: 'horizontal' \| 'vertical'` prop (or split into `SummaryLine` and `SummaryBlock`) and switch the five listed call sites to vertical. Keep `ChecklistRow` (icon + text, line 4657-4665) and the `StatusPill` companion rows (line 2923-2926, 3134-3144) horizontal — they are fixed-width pairs by design. |

### D-06 — Auto-retry on connectivity regain is dead code

| Field | Detail |
|---|---|
| Severity | **High** for offline-first promise |
| Area | offline-sync |
| Expected | When the device regains network, queued reports auto-retry without the technician needing to manually press "Tentar novamente". The architect's 8.6 analysis flagged this as a structural concern. |
| Actual | `detectConnectivityRegain` is defined and tested at [mobile/src/features/sync/syncConnectivityRegain.ts](mobile/src/features/sync/syncConnectivityRegain.ts) and covered by `syncStateConnectivityRegain.test.ts`. Grep for the function across the mobile src tree: it is imported **only** by its own test file. No production code path calls it — not `TagWiseApp.tsx`, not any `useEffect` on app foreground or network state change, not `evidenceUploadOrchestrator.ts`. The session's `connectionMode` never flips back to `'connected'` after an offline period. |
| Reproduction (code-path inspection) | `rg detectConnectivityRegain mobile/src` returns exactly one production-source occurrence (the definition) and one test occurrence (the test importing it). No call site in any screen, app shell, or service. |
| Files / components | `mobile/src/shell/TagWiseApp.tsx` (would be the natural caller, on app foreground / `AppState` change / NetInfo subscription), `mobile/src/features/sync/syncConnectivityRegain.ts` (orphaned helper) |
| Recommended fix direction | Register a NetInfo listener (or `AppState` 'active' listener if NetInfo is not yet wired) in `TagWiseApp.tsx`. On wake/regain, call `detectConnectivityRegain({ currentSession, restoreSession, retryEligibleReports })` and dispatch the resulting session update + `SyncRetrySummary` toast. The helper is already shaped for this; only the wiring is missing. |

### D-07 — Mobile demo/visual-shell sample values are not drawn from the seeded backend dataset

| Field | Detail |
|---|---|
| Severity | **Medium** (data confusion during manual testing) |
| Area | data |
| Expected | When a manual tester opens the visual shell against a backend-seeded tag (e.g., PT-101 on `work-package-bp-2025-001-a`), the metrics shown (range, last value, last result) match what the seeded backend would expose for that tag. |
| Actual | The visual-shell `model.ts` ([mobile/src/features/visual-shell/model.ts:257-327](mobile/src/features/visual-shell/model.ts#L257-L327)) carries a separate set of hardcoded metrics that are not synchronized with the backend seed in `backend/src/modules/work-packages/seedData.ts`. The merge rule (`authenticated \|\| !demoEnabled ? localTags : mergeVisualTags(localTags, seededTags)`) does correctly avoid leaking demo tags into authenticated catalogs, but visual-shell-only sample numerics (`expectedValue: 8`, `observedValue: 9.45`, etc.) still ride along with the **visualization** of authenticated tags. |
| Files / components | `mobile/src/features/visual-shell/model.ts`, `backend/src/modules/work-packages/seedData.ts` |
| Recommended fix direction | Route the displayed metrics through the existing `executionShellService` / `serviceBackedExecution` adapters for authenticated tags, so that no `expectedValue`/`observedValue` literal in `visual-shell/model.ts` is reached for an authenticated session. Keep the literals only inside the explicit demo path (`EXPO_PUBLIC_TAGWISE_ENABLE_DEMO_SHELL=true`). |

---

## 3. Unverified but Suspicious Issues

These are real-looking concerns I could not fully confirm without a phone in hand. Each one needs a manual Android pass before treating it as a defect.

### S-01 — Calculator mode is not persisted across close/reopen
The `helperMode` toggle (`Conversao` / `Loop`) in `FieldCalculatorScreen` is a local `useState`, so closing the calculator and reopening resets it. Unclear whether this matters to the user's actual workflow.
**Manual check:** Open calculator → switch to Loop → leave to detail → reopen calculator. Did the mode persist?

### S-02 — Empty-state Pressable cards have no press feedback
The history empty-state and timeline empty-state cards ([VisualProductShell.tsx:3187-3196, :3217-3226](mobile/src/shell/VisualProductShell.tsx#L3187-L3196)) are wrapped in `Pressable` (Story 8.7 fix), but reuse the static `pendingCard` style — no `pressed` opacity, no ripple. On a phone the user may not realize the card is tappable.
**Manual check:** Tap the empty history card. Did you get any visual hint that the tap registered before the route changed?

### S-03 — Diagnosis route does not auto-save checklist outcome changes
`onSaveGuidanceEvidence` is a manual Pressable on `ServiceGuidanceScreen`. If the technician changes a checklist outcome and navigates away without pressing "Salvar checklist", the change may be lost. The code reads as if explicit save is required, but the user's mental model is auto-save.
**Manual check:** Toggle a checklist outcome → press hardware back → return to checklist. Is the toggle still set?

### S-04 — KeyboardAvoidingView is iOS-only; Android keyboard may cover inputs
The architect 8.6 analysis flagged this and the test suite cannot verify it. Long-form fields (supervisor comment, return reason, justification text) on the lower half of the screen are the suspects.
**Manual check:** Open supervisor return-comment input on a real Android keyboard at default + 130% font scale. Does the keyboard occlude the input?

### S-05 — Loop-test photo `contextNote` reaches the local report but not the supervisor (subset of D-02)
The user already sees `Ponto de loop 50%` on the technician's own report screen (local). What he cannot verify without two devices is whether the supervisor sees the same label after sync. Per D-02 this is a confirmed gap at the model level — but the actual phone-to-phone round-trip needs to be observed once.
**Manual check:** Submit a report with a 50% loop-point photo. Sign in as supervisor on the second device. Is the photo labelled `Ponto de loop 50%` or unlabelled?

### S-06 — Manual AI request action surface
The architect's analysis and the user's hypothesis both expect a "Solicitar diagnóstico assistido" button somewhere on the report screen. I could not find one in any rendered screen. Most likely this matches D-01 (never built), but worth confirming on the phone in case it's hidden under a long-press or modal.
**Manual check:** Open the report screen with a fully-filled local report. Scroll the AI Diagnosis section. Is there any tappable affordance to request AI?

---

## 4. Data Quality Review

### Realism vs. each criterion the user named

| Criterion | Status | Notes |
|---|---|---|
| Multiple realistic instruments/tags | **Partial** | Backend seeds 5 real tags (PT-101, TT-205, AI-330, LT-410, XV-402) across 2 packages — adequate breadth for variety testing. Mobile visual-shell carries 6 demo tags (PT-204, TT-211, FT-078, LT-090, IT-443, PT-156) but those are now correctly gated behind `EXPO_PUBLIC_TAGWISE_ENABLE_DEMO_SHELL=true`. |
| Realistic industrial areas, parent equipment, variables, ranges, units, signal types, tolerances, criticality, due dates | **Present** | `seedData.ts` carries `area`, `parentAssetReference`, `range`, `tolerance`, `criticality`, `signalType`, `instrumentFamily` for each tag at realistic values. |
| Instrument history (prior calibrations, dates, measured values, outcomes) | **Partial** | Only `lastObservedAt`, `summaryText`, `lastResult`, and `trendHint` are seeded. **No prior calibration point data** (e.g., `0% → expected 0 mA / measured 0.02 mA / pass`). |
| Previous technical reports with content | **Missing** | No seeded `Report` records. |
| Previous tests with measured values and tolerances | **Missing** | Tolerances exist as template metadata; no actual prior reading rows. |
| Technician comments / observations | **Missing** | Only system-generated trend hints, no narrative observations. |
| Evidence/photo references | **Missing** | `minimumSubmissionEvidence` / `expectedEvidence` describe what's required; no seeded evidence records or photo metadata pointers. |
| Supervisor approval/return/escalation history | **Missing** | `ensureSeedRoutes` seeds the routing only — no seeded decisions/comments/escalation rationales. |
| Future SAP / Maximo / TOTVS integration shape | **Partial** | `sourceReference: 'seed-cmms-1001'` and `parentAssetReference: 'asset-feed-header-01'` are aligned with CMMS thinking. Missing: explicit `workOrderId`, `equipmentId` (distinct from asset reference), and functional-location hierarchy (`plant.area.unit.equipment`). |

### Where the gap matters for the user's manual testing

The user wants to manually verify history comparison, calculation against last result, returned-report reopen, evidence rendering, and supervisor review decisions. The current seed supports the first two and the last one only at a surface level. He cannot meaningfully test "did the comparison screen highlight the new drift correctly?" because no real prior readings are seeded to compare against. He cannot test "supervisor sees the prior approval comment on the returned report" because no seeded approval history exists.

---

## 5. UI/UX Review

Verified items (besides D-05 above):

- **Lifecycle/state enum translation has a near-final gap.** Story 8.7 added PT-BR for most lifecycle states via `translateVisibleText` / `toHistoryResultLabel`, but the technician report header still renders `report.lifecycleStateLabel` directly in some paths and the supervisor review queue rendering uses `reviewLifecycleLabel`. Worth scanning once more to ensure every enum value (`technician-owned-draft`, `submitted-pending-sync`, `submitted-pending-review`, `pass-with-note`, `returned-by-supervisor`, `returned-by-manager`, `approved`, `escalated-pending-manager-review`) is mapped at every rendering site.
- **Empty-state Pressables lack visual feedback** (S-02). User likely will not realize they are tappable.
- **Sync state surface is two-tier where the model is six-tier.** `SharedExecutionSyncState` has six states; the UI rolls them up via `syncBadge`. For diagnosing "queued vs. pending-validation vs. sync-issue" on a phone, the user has to read fine print. The architect 8.6 analysis suggested a `Sincronização` diagnostic card on the dashboard; that is still not present.
- **No visible AI Diagnosis surface beyond placeholder.** Tied to D-01.
- **Touch-target ergonomics on the QR scanner Pressable** are unverified without a device. The QR button is the main entry to scanning; worth a manual mis-tap check.

---

## 6. Regression Risk List

Areas most likely to break if any of the above defects are fixed carelessly:

1. **`VisualProductShell.tsx` (6,500+ lines, no renderer tests).** Any change to a memo, a Pressable, or a screen render passes the test suite by definition (no UI tests exist for this file). The biggest risk in the next implementation pass.
2. **`SharedExecutionPhotoAttachment` model.** Adding `technicianNote` (D-04) or widening `SharedExecutionStepKind` for instrument-level (D-03) will ripple through `attachPhotoEvidence`, `evidenceUploadOrchestrator`, `serviceBackedReport`, and supervisor review. Round-trip tests will need to grow.
3. **`reportSubmissionService.submitForValidation` and the new worker job for AI (D-01).** Touching the report submission path risks regressing Story 8.7's per-attachment try/catch fix (`evidenceUploadOrchestrator.syncSubmittedReportEvidence`). Any change to "what happens at submit" must preserve the contract that report submission proceeds even when a per-photo upload fails.
4. **`buildSubmitBlockingHooks`.** The Story 8.7 rule change restricted hard-blocks to `severity === 'submit-block'`. Any regression here will reintroduce Finding #5 and lock technicians out of submission again. New AI work must not add a hard-block.
5. **`MetricLine` / `SummaryLine` rewrite (D-05).** These primitives are reused across many screens. Changing the rendering shape in place will affect every consumer; safer to add a variant prop than to mass-rewrite.
6. **Backend `report_photo_attachments` schema.** Adding `contextNote` and `technicianNote` requires a migration. Make sure existing rows backfill to `null` and the existing tests in `backend/src/modules/report-submissions/` continue to pass.
7. **Connectivity regain wiring (D-06).** If wired sloppily to `AppState` instead of NetInfo, the auto-retry could fire on every screen unlock, causing spurious calls.

---

## 7. Recommended Next BMAD Step

### Split or one story?

**Two stories, in the suggested order.** The defects cluster cleanly into two themes; bundling them into one will make manual phone QA harder, not easier.

### Story 8.8 — Evidence model, instrument-level photos, supervisor context (D-02, D-03, D-04, D-05, D-07)

- Tactically self-contained: a model widening + per-screen UI work + backend persistence + supervisor projection. Easy to manually verify end-to-end.
- Suggested title: **"Photo evidence three-context model, contextNote round-trip, instrument-level photos, and report/review vertical-block layout."**
- Suggested sub-tracks: (i) extend `SharedExecutionPhotoAttachment` with `technicianNote`; (ii) add instrument-level photo entry on `TagDetailScreen`; (iii) thread `contextNote` and `technicianNote` through submission DTO, backend table, supervisor DTO, and supervisor render; (iv) convert `MetricLine` and `SummaryLine` to vertical at the five listed call sites; (v) move visual-shell sample values out of authenticated code paths (D-07).
- Fix before the next manual Android test pass.

### Story 8.9 — AI diagnosis end-to-end and offline-regain auto-retry (D-01, D-06)

- Larger, infrastructure-shaped, and requires the worker. Should NOT block 8.8.
- Suggested title: **"AI diagnosis worker, manual + submission-time triggers, supervisor visibility, and offline-regain auto-retry wiring."**
- Suggested sub-tracks: (i) add `ai-diagnosis.generate-for-report` worker job; (ii) enqueue on `submitForValidation`; (iii) add manual `POST /reports/:id/ai-diagnosis/request`; (iv) add `aiDiagnosis` to `SupervisorReviewReportDetail`; (v) thread into the two mobile projection sites; (vi) add a "Solicitar diagnóstico assistido" Pressable on the report screen; (vii) wire `detectConnectivityRegain` into `TagWiseApp.tsx` via NetInfo subscription.
- Can defer until after 8.8 ships and the next manual Android pass is clean.

### What to fix NOW before the next manual Android test

From Story 8.8, prioritize **D-02 and D-03** — they materially change what the supervisor sees and what the technician can capture, so they affect the script the user runs on the phone. **D-05** (layout) is also worth doing in this pass because it touches the same screens.

### What can be deferred

- D-04 (per-photo technician note) — nice-to-have, can land in 8.8 or 8.9 depending on capacity.
- D-07 (visual-shell sample value cleanup) — cosmetic for authenticated flow; defer until after 8.8.
- All of Story 8.9 can wait until the supervisor-side phone test of 8.8 is clean.

### Data depth (H1) — recommendation

The data realism gaps (no prior reading rows, no prior report records, no approval-decision history) are not blocking the next manual phone pass *if* the technician's first goal is to exercise the new evidence flow. They will start blocking the moment the user wants to verify history comparison and returned-report-reopen. Suggest a **separate small data-enrichment story (Story 8.10)** for seeding richer history, prior reports, and prior approval/return/escalation records — sized to a half-day. Treat it as parallelizable with 8.9.

---

## 8. Validation Performed

### Commands run

```powershell
cd c:/Users/emili/Desktop/Projets/TagWise4to20/mobile;  npm test -- --run     # 180/180 PASS
cd c:/Users/emili/Desktop/Projets/TagWise4to20/backend; npm test -- --run     # 92 PASS, 1 skipped (env-gated TagWise live API smoke)
```

### Test results summary

- Mobile vitest: **180 / 180 PASS** (32 test files), duration ~3s. No flakes observed in the single run.
- Backend vitest: **92 PASS / 1 skipped** (`tagWiseLiveApiSmoke.test.ts` requires `TAGWISE_LIVE_API_BASE_URL` env var pointing at a running backend on LAN — out of scope for static QA).
- Backend AI mock smoke (`backend/src/ops/aiDiagnosisSmoke.test.ts`) passes against the mock provider — confirms the boundary works in isolation, but does not test integration with the report-submission flow because that integration does not exist (D-01).

### Code paths inspected (verifying, not skimming)

- `mobile/src/shell/VisualProductShell.tsx` — relevant ranges for AI projection wiring (line 388-419), `TagDetailScreen` (~2488-2632), `ServiceCalculationScreen` (~2280-2477), `LoopExecutionScreen` (~2452-2622), `ServiceGuidanceScreen` (~3380-3460), `ServiceReportScreen` (~3540-3700), `ServiceHistoryScreen` (~3150-3230), `ServiceReviewScreen` (~3868-4015), `ReviewDetailView` (~4017-4100+), style primitives `MetricLine` / `SummaryLine` / `ReportSummaryBlock` / `HistoryRow`.
- `mobile/src/features/visual-shell/serviceBackedReport.ts` — projection signature + AI default path.
- `mobile/src/features/visual-shell/serviceBackedReview.ts` — supervisor projection + photo attachment shape.
- `mobile/src/features/execution/sharedExecutionShellService.ts` — `attachPhotoEvidence`, `submitReport`, `buildSubmitBlockingHooks`.
- `mobile/src/features/execution/model.ts` — `SharedExecutionPhotoAttachment` shape.
- `mobile/src/features/sync/evidenceUploadOrchestrator.ts` — submission payload shape, per-attachment try/catch (Story 8.7 fix verified).
- `mobile/src/features/sync/syncConnectivityRegain.ts` — verified orphaned via grep across `mobile/src` for `detectConnectivityRegain`.
- `mobile/src/features/visual-shell/model.ts` — visual-shell tag/demo merge logic.
- `backend/src/worker/main.ts` — registered handler list.
- `backend/src/modules/report-submissions/`, `backend/src/modules/review/` — model files; grep for `contextNote` and `aiDiagnosis` (zero hits in both modules).
- `backend/src/modules/work-packages/seedData.ts` — seed records, history summaries.
- `backend/src/modules/ai-diagnosis/` — provider boundary (mock + OpenAI), factory, unit tests.

### Limitations

- **No real Android device run in this pass.** The defects flagged "verified" are verified from code; the unverified-but-suspicious items (S-01..S-06) all need a phone in hand to confirm.
- **No live backend round-trip** (no 4-terminal workflow run). The backend connection-mode behavior, evidence upload finalization on the worker, and supervisor queue refresh under live load were not exercised end-to-end in this pass — they are covered by Story 8.7's own validation gate (manual phone smoke).
- **No renderer tests.** The five rendering-shape defects (D-05 layout, S-02 press feedback, D-03 missing button, D-04 missing input, D-01 manual-trigger button) are inferred from reading the JSX, not from rendering it. Story 8.6 / 8.7 deliberately deferred renderer tests; the next BMAD planning conversation should decide whether to introduce `@testing-library/react-native` now or after Story 8.8.
- **Maestro device E2E remains deferred** (Story 8.7-T). The QA loop "code green, phone red" risk that the architect 8.6 analysis raised is still present.

---

## Cross-references

- [Story 8.7 implementation artifact](../implementation-artifacts/8-7-live-phone-field-workflow-repair.md) — what was just fixed
- [Live phone 8.6 regression root-cause analysis](live-phone-story-8-6-regression-root-cause-analysis.md) — Winston's structural diagnosis (most of D-01, D-06 trace to issues he raised)
- [PRD](prd.md), [architecture](architecture.md), [story map](story-map.md) — source of truth for expected behaviour
- [Implementation test summary](../implementation-artifacts/tests/test-summary.md) — automated regression baseline

---

## Closing note

The interesting defects in this pass — D-01 and D-02 — are both *contract gaps between layers that each individually pass their tests*. The mobile projection accepts an optional `aiDiagnosis`; the caller never passes it. The mobile evidence model carries `contextNote`; the submission DTO never includes it. Three rounds of "code green, phone red" have warned that this is the failure mode of the current testing strategy. The next implementation story should land at least one contract-level test that exercises both sides of a boundary at once — the simplest of these would be a vitest case that submits a photo through the orchestrator and asserts the persisted backend row includes `contextNote`. That is a defensible Story 8.8 acceptance criterion, not a Story-8.9 luxury.
