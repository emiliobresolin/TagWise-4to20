# TagWise QA Defect Discovery Report — Pass 2 (Story 8.8 re-verification)

- **Date:** 2026-05-14
- **Author:** QA re-verification pass after Story 8.8
- **Predecessor:** [`qa-defect-discovery-2026-05-14.md`](qa-defect-discovery-2026-05-14.md) — Pass 1
- **Source of truth:** Story 8.8 implementation artifact (`_bmad-output/implementation-artifacts/8-8-evidence-three-context-vertical-layout-and-connectivity-regain.md`), current mobile + backend code at HEAD, automated test suite
- **Intent:** Re-verify D-02 through D-07 are actually fixed, scan for new defects introduced by Story 8.8, decide whether Story 8.9 (AI end-to-end) can start. **The user has explicitly chosen software-only iteration until all implementation is done, so this report is the gate, not a phone test.**

---

## 1. Verdict

**Pass with concerns.**

All seven Story 8.8 defects (D-02 through D-07 + PT-BR sweep + data realism) are verified at the code-level boundaries the QA Pass 1 report named. Both test suites are green (mobile 186/186, backend 92 passing + 1 env-gated skip — unchanged baseline). Story 8.7 guardrails (calculator, submit rule, back handler, per-attachment try/catch, classifySyncError) are intact.

Two **non-blocking concerns** surfaced that should be carried forward into Story 8.9 spec but do not require a Story 8.8.x patch:

- **C-01 (medium):** AppState-only connectivity regain only fires on foreground transitions, not in-app network restore. Story 8.8 documented this as an explicit trade-off; flagging it here so Story 8.9 can decide whether to add NetInfo.
- **C-02 (medium, pre-existing):** Backend does not validate `contextNote` / `technicianNote` string length. Not a Story 8.8 regression (those fields didn't exist before), but worth adding bounds at the same time AI diagnosis fields land.

One QA-agent claim flagged as "HIGH / blocking" was **investigated and dismissed as a false alarm** (`updatePhotoTechnicianNote` not bumping `updatedAt` — see §3 D-04 verification). Documented here so the next pass doesn't re-flag it.

**Greenlight Story 8.9 (AI end-to-end).**

---

## 2. Per-defect verdict matrix

| Defect | Story 8.8 fix claim | Code-level verdict | Test/phone | Notes |
|---|---|---|---|---|
| D-02 — `contextNote` round-trip | DTO widened end-to-end | **FIXED** | Vitest covers; NEEDS PHONE for supervisor render | Cross-boundary test asserts non-null values flow through |
| D-03 — instrument-level photo entry | `Foto do instrumento` panel + `'instrument'` step kind | **FIXED** | NEEDS PHONE for camera permission + attach round-trip | Gate `selectedExecutionTemplateId` is effective |
| D-04 — per-photo technician note | `technicianNote` field + inline editor + `updatePhotoTechnicianNote` | **FIXED** | NEEDS PHONE for inline edit UX | Verified the note re-syncs correctly via report submission DTO, not metadata pipeline |
| D-05 — vertical title-over-value | `variant` prop on `SummaryLine` / `MetricLine`; applied at 5 priority sites | **FIXED** | NEEDS PHONE for layout density | Other horizontal sites (supervisor access, demo screens) intentionally left horizontal |
| D-06 — connectivity regain wiring | `AppState` listener + 30s rate limit | **PARTIAL** | NEEDS PHONE | Foreground transition path works; in-app network restore not handled — see C-01 |
| D-07 — visual-shell sample-value gating | `isDemoShell` gate on calculation/history/diagnosis/report literals | **FIXED** | Existing `visualWorkflow.test.ts` proves gate works | Authenticated paths confirmed to use service-backed projections instead |
| PT-BR sweep | `In Progress` / `Ready to Submit` + evidence presence translators + step-label helpers | **FIXED** | NEEDS PHONE for full visual scan | No raw enums leak to UI; default fallthrough on unknown values is defensible |
| Data realism | History summaries enriched with measured values + supervisor decisions | **FIXED** | NEEDS PHONE for comparison screen | Prior `Report` entities + approval history still deferred to Story 8.10 |

---

## 3. Detailed verification

### D-02 / D-04 — `contextNote` and `technicianNote` round-trip — FIXED

End-to-end boundary verification (every claim from Story 8.8 AC 1):

| Boundary | File:line | Verified |
|---|---|---|
| `SharedExecutionPhotoAttachment.technicianNote: string \| null` non-optional | [mobile/src/features/execution/model.ts:231](mobile/src/features/execution/model.ts#L231) | ✓ |
| `SharedExecutionStepKind` includes `'instrument'` | [mobile/src/features/execution/model.ts:3](mobile/src/features/execution/model.ts#L3) | ✓ |
| `StoredExecutionPhotoAttachmentPayload.technicianNote?: string \| null` optional | [mobile/src/features/execution/model.ts:429](mobile/src/features/execution/model.ts#L429) | ✓ |
| `attachPhotoEvidence` accepts `{ contextNote, technicianNote, executionStepIdOverride }` | [mobile/src/features/execution/sharedExecutionShellService.ts:401-403](mobile/src/features/execution/sharedExecutionShellService.ts#L401-L403) | ✓ |
| `updatePhotoTechnicianNote` exists, gated by lock, trims whitespace to null | [mobile/src/features/execution/sharedExecutionShellService.ts:521-573](mobile/src/features/execution/sharedExecutionShellService.ts#L521-L573) | ✓ |
| `isExecutionStepKind` accepts `'instrument'` | [mobile/src/features/execution/sharedExecutionShellService.ts:3050](mobile/src/features/execution/sharedExecutionShellService.ts#L3050) | ✓ |
| Parser round-trips both fields with defensive null/string check | [mobile/src/features/execution/sharedExecutionShellService.ts:2599-2606](mobile/src/features/execution/sharedExecutionShellService.ts#L2599-L2606) | ✓ |
| `buildPhotoAttachments` mapper surfaces `technicianNote` | [mobile/src/features/execution/sharedExecutionShellService.ts:2545](mobile/src/features/execution/sharedExecutionShellService.ts#L2545) | ✓ |
| Orchestrator's local parser round-trips both fields | [mobile/src/features/sync/evidenceUploadOrchestrator.ts:684-691](mobile/src/features/sync/evidenceUploadOrchestrator.ts#L684-L691) | ✓ |
| `loadPhotoSubmissionAttachments` emits all 3 new fields | [mobile/src/features/sync/evidenceUploadOrchestrator.ts:429-431](mobile/src/features/sync/evidenceUploadOrchestrator.ts#L429-L431) | ✓ |
| `EvidenceUploadMetadataRequest.executionStepId` widened to include `'instrument'` | [mobile/src/features/sync/evidenceUploadApiClient.ts:26](mobile/src/features/sync/evidenceUploadApiClient.ts#L26) | ✓ |
| `ReportSubmissionRequest.photoAttachments[]` carries 3 optional fields | [mobile/src/features/sync/evidenceUploadApiClient.ts:114-123](mobile/src/features/sync/evidenceUploadApiClient.ts#L114-L123) | ✓ |
| Backend `ReportSubmissionPhotoAttachment` carries 3 optional fields | [backend/src/modules/report-submissions/model.ts:74-85](backend/src/modules/report-submissions/model.ts#L74-L85) | ✓ |
| Backend `ReportSubmissionPhotoExecutionStepId` union exists | [backend/src/modules/report-submissions/model.ts](backend/src/modules/report-submissions/model.ts) | ✓ |
| Supervisor `getPhotoAttachments(payload)` passes payload through without filtering | [backend/src/modules/review/supervisorReviewService.ts:493-496](backend/src/modules/review/supervisorReviewService.ts#L493-L496) | ✓ (no `.pick`/`.map` strips fields) |
| Mobile `SupervisorReviewPhotoAttachment` mirrors 3 optional fields | [mobile/src/features/review/model.ts:36-42](mobile/src/features/review/model.ts#L36-L42) | ✓ |
| `VisualReviewPhotoAttachmentProjection` adds `contextSubtitle` + `technicianNoteLabel` | [mobile/src/features/visual-shell/serviceBackedReview.ts:69-81](mobile/src/features/visual-shell/serviceBackedReview.ts#L69-L81) | ✓ |
| Supervisor projection populates both at the `.map()` site | [mobile/src/features/visual-shell/serviceBackedReview.ts:285-289](mobile/src/features/visual-shell/serviceBackedReview.ts#L285-L289) | ✓ |
| `formatPhotoExecutionStepLabel` + `formatPhotoContextSubtitle` exported + tested | [mobile/src/features/visual-shell/serviceBackedReport.ts](mobile/src/features/visual-shell/serviceBackedReport.ts), tests at [mobile/src/features/visual-shell/serviceBackedReport.test.ts](mobile/src/features/visual-shell/serviceBackedReport.test.ts) | ✓ (5 new test cases) |
| Supervisor review photo card renders `contextSubtitle` + `technicianNoteLabel` | [mobile/src/shell/VisualProductShell.tsx](mobile/src/shell/VisualProductShell.tsx) supervisor block | ✓ |
| `ReportPhotoCard` inline component with `Editar observacao` editor | [mobile/src/shell/VisualProductShell.tsx:4608-4707](mobile/src/shell/VisualProductShell.tsx#L4608-L4707) | ✓ |
| `handleAttachExecutionPhoto` + `handleUpdatePhotoTechnicianNote` wired in `TagWiseApp.tsx` and passed as props | [mobile/src/shell/TagWiseApp.tsx:1581-1621, 2554-2555](mobile/src/shell/TagWiseApp.tsx#L1581-L1621) | ✓ |
| Cross-boundary round-trip test exists with non-null values | [mobile/src/features/sync/evidenceUploadOrchestrator.test.ts:405-483](mobile/src/features/sync/evidenceUploadOrchestrator.test.ts#L405-L483) | ✓ |

**One claim investigated and dismissed:**

> "QA agent flagged `updatePhotoTechnicianNote` as HIGH/blocking because it does not bump the metadata record's `updatedAt`, claiming the note would be lost on re-sync when the photo is already finalized."

This is incorrect. The flow:

- `EvidenceUploadMetadataRequest` (the per-photo metadata sync DTO) does NOT carry `technicianNote` or `contextNote` — confirmed by reading [mobile/src/features/sync/evidenceUploadApiClient.ts:10-32](mobile/src/features/sync/evidenceUploadApiClient.ts#L10-L32). The metadata sync handles binary presence + authorization only.
- The technician note travels exclusively via `ReportSubmissionRequest.photoAttachments[]` (the report submission DTO), built by `loadPhotoSubmissionAttachments` at submit time. That function reads the **current** `payloadJson` from each evidence metadata record — so any in-place mutation to the note IS captured at submit time.
- `updatePhotoTechnicianNote` is gated by `isReportLockedForTechnician` at [mobile/src/features/execution/sharedExecutionShellService.ts:527](mobile/src/features/execution/sharedExecutionShellService.ts#L527). The lock evaluates to true only when `report.state === 'submitted-pending-review'` ([mobile/src/features/execution/sharedExecutionShellService.ts:1976-1980](mobile/src/features/execution/sharedExecutionShellService.ts#L1976-L1980)) — i.e., once the server has accepted the report. While the report is `'technician-owned-draft'` or `'submitted-pending-sync'`, the note can be edited and the next submission carries the updated value.
- For returned reports, the local state reverts to `'technician-owned-draft'` (per `mapServerReportStateToLocal` in `evidenceUploadOrchestrator.ts`), so the technician can re-edit the note and the next resubmission carries it.

Conclusion: the existing implementation is correct. Bumping `updatedAt` would be redundant since the metadata sync queue's idempotency key never includes the note.

### D-03 — Instrument-level photo entry — FIXED

- `'instrument'` step kind added to all three locations: mobile `SharedExecutionStepKind`, backend `ReportSubmissionPhotoExecutionStepId`, mobile API client `EvidenceUploadMetadataRequest.executionStepId`.
- `Foto do instrumento` panel renders on `TagDetailScreen` at [mobile/src/shell/VisualProductShell.tsx:2678](mobile/src/shell/VisualProductShell.tsx#L2678) with active/disabled state gated by `selectedExecutionTemplateId`.
- Handler chain: `onAttachInstrumentPhoto(source)` → `onAttachReportPhoto(source, 'Instrumento', { executionStepIdOverride: 'instrument' })` → `handleAttachExecutionPhoto` → `executionShellService.attachPhotoEvidence` with override.
- **Gate behaviour:** the disabled state prevents the tap altogether. If somehow tapped before the execution shell loads, `handleAttachExecutionPhoto` returns early on `!readyState.executionShell`. Safe.

### D-04 — Per-photo technician comment — FIXED

- `ReportPhotoCard` component at [mobile/src/shell/VisualProductShell.tsx:4608-4707](mobile/src/shell/VisualProductShell.tsx#L4608-L4707) wraps the photo render with an inline `Editar observacao` Pressable.
- State machine: `[editing, setEditing]` + `[draft, setDraft]`. `Salvar observacao` calls `onUpdatePhotoTechnicianNote(draft.trim().length === 0 ? null : draft)` and exits edit mode. `Cancelar` resets `draft = attachment.technicianNote ?? ''` and exits.
- Supervisor sees the note via `photo.technicianNoteLabel` on the supervisor photo card. Empty state renders `"Sem observacao do tecnico."`.

### D-05 — Vertical title-over-value layout — FIXED

Five priority sites all use `variant="vertical"`:

| Site | File:line | Verified |
|---|---|---|
| Instrument detail metric panel (6 `MetricLine`) | [mobile/src/shell/VisualProductShell.tsx:2571-2597](mobile/src/shell/VisualProductShell.tsx#L2571-L2597) | ✓ |
| Technician report header (5 `SummaryLine`) | [mobile/src/shell/VisualProductShell.tsx:3674-3687](mobile/src/shell/VisualProductShell.tsx#L3674-L3687) | ✓ |
| Supervisor review queue card (4 `SummaryLine`) | [mobile/src/shell/VisualProductShell.tsx:4053-4064](mobile/src/shell/VisualProductShell.tsx#L4053-L4064) | ✓ |
| Supervisor review detail (2 fixed + dynamic) | [mobile/src/shell/VisualProductShell.tsx:4141-4150](mobile/src/shell/VisualProductShell.tsx#L4141-L4150) | ✓ |
| Vertical styles defined | [mobile/src/shell/VisualProductShell.tsx:6404-6419, 6953-6969](mobile/src/shell/VisualProductShell.tsx) | ✓ |

Intentionally left horizontal (compact pairs by design, not flagged in QA Pass 1):

- Supervisor access status block at line ~3997-4000 (Acesso / Perfil / Estado / Autoridade) — short status row, fine horizontal.
- `DemoReportScreen` summary at line ~4348+, 4413+ — demo-only, not in authenticated flow.

### D-06 — Connectivity regain wiring — PARTIAL (acceptable trade-off)

Verified correct at the React lifecycle level:

- `useRef<boolean>(false)` busy guard + `useRef<number>(0)` rate-limit timestamp at [mobile/src/shell/TagWiseApp.tsx:362-363](mobile/src/shell/TagWiseApp.tsx#L362-L363).
- Effect early-returns when `status.type !== 'ready'` or `!status.session` (line ~365).
- Handler `handleForeground` registered via `AppState.addEventListener('change', handleForeground)`; cleanup calls `subscription.remove()`.
- 30-second rate limit + busy-flag guard prevent flood.
- `setStatus` updater guards with `if (current.type !== 'ready') return current` — safe against state updates on unmounted/changed status.
- `detectConnectivityRegain` imported from production code at [mobile/src/shell/TagWiseApp.tsx](mobile/src/shell/TagWiseApp.tsx); previously only consumed by its own unit test.

**C-01 — Documented limitation, not a defect.** AppState fires `'active'` only on foreground transitions. If the user keeps the app in the foreground while the network drops and recovers (e.g., walking through a building with intermittent WiFi), the listener does not fire and the regain handler does not run. Story 8.8 documented this as an explicit trade-off to avoid pulling in NetInfo. The Story 8.9 spec should decide whether to address this; it does not block Story 8.9 from starting.

Minor flags (none blocking):

- **Rate-limit ref persists across rapid user switch.** If user A triggers regain at T=0 and user B signs in at T=5, user B's first foreground is rate-limited until T=30. Unlikely in practice (sign-out flow is slower than 30s), but a clean fix would reset the ref on `status.session` change.
- **First foreground passes the gate on app launch.** `lastRegainAttemptAtRef` initialised to 0, so `Date.now() - 0 > 30_000` is always true. This is intentional — eager regain on launch.

### D-07 — Visual-shell sample-value gating — FIXED

- `isDemoShell = !authenticated && demoEnabled` gate at [mobile/src/features/visual-shell/model.ts:263](mobile/src/features/visual-shell/model.ts#L263).
- `calculation`, `history`, `diagnosis`, `report` all conditionally built from demo literals only when `isDemoShell` is true; neutral placeholders otherwise.
- Existing tests in [mobile/src/features/visual-shell/visualWorkflow.test.ts](mobile/src/features/visual-shell/visualWorkflow.test.ts) prove the gate (authenticated=true ⇒ no seeded data merged, lines 36-50 of that test).
- Authenticated render paths consume `serviceCalculation` / `serviceHistory` / `serviceGuidance` / `serviceReport` from the service-backed projections, never read `model.calculation` etc. — verified by grep across `VisualProductShell.tsx`.

### PT-BR sweep — FIXED

- `reviewLifecycleLabel` covers `'In Progress'` / `'Ready to Submit'` plus all 5 server-side lifecycle states at [mobile/src/shell/VisualProductShell.tsx:5422-5447](mobile/src/shell/VisualProductShell.tsx#L5422-L5447). Default falls through to raw value — defensible because the union is fully covered.
- `translateEvidencePresenceState` + `translateEvidencePresenceMessage` defined in [mobile/src/features/visual-shell/serviceBackedReview.ts](mobile/src/features/visual-shell/serviceBackedReview.ts) and wired into the supervisor `evidenceStatusRows` projection.
- `formatPhotoExecutionStepLabel` handles all 6 step kinds + null/undefined → `'Sem etapa'`. Five new unit tests cover the mapper.
- No raw English enums found in user-facing render paths via grep.

### Data realism — FIXED (narrative-only depth)

- 5 `historySummary` records in [backend/src/modules/work-packages/seedData.ts](backend/src/modules/work-packages/seedData.ts) now carry: dated decisions, measured-vs-expected pairs with comma-decimal PT-BR, tolerance references, supervisor outcomes, and action-oriented `trendHint` strings.
- Prior `Report` entities and approval-decision records are **still not seeded** — explicit deferral to Story 8.10 per Story 8.8 non-goals.

---

## 4. Regression watch (Story 8.7 preserved)

| Story 8.7 guardrail | Status | File:line |
|---|---|---|
| Calculator `Modo: Conversao` / `Modo: Loop` toggle + Calcular button + Resultado panel | ✓ Intact | [mobile/src/shell/VisualProductShell.tsx:~1869-1886](mobile/src/shell/VisualProductShell.tsx#L1869) |
| Submit rule: only `severity === 'submit-block'` blocks; minimum-evidence still blocks | ✓ Intact | [mobile/src/features/execution/sharedExecutionShellService.ts:1379-1388](mobile/src/features/execution/sharedExecutionShellService.ts#L1379-L1388) |
| Back handler + route history stack | ✓ Intact (no new modals introduced) | [mobile/src/shell/VisualProductShell.tsx](mobile/src/shell/VisualProductShell.tsx) |
| Per-attachment try/catch in orchestrator | ✓ Intact, new fields don't break the catch path | [mobile/src/features/sync/evidenceUploadOrchestrator.ts:65-92](mobile/src/features/sync/evidenceUploadOrchestrator.ts#L65-L92) |
| `classifySyncError` 4 PT-BR classes | ✓ Intact, 4 vitest cases still pass | [mobile/src/features/visual-shell/serviceBackedReport.ts](mobile/src/features/visual-shell/serviceBackedReport.ts) |

---

## 5. Concerns (carry-forward, not blocking)

### C-01 — In-app network regain not detected (D-06 limitation)

- **Severity:** Medium.
- **Manifestation:** App stays in foreground; WiFi/cellular drops then recovers; the regain handler does not fire because `AppState` did not transition to `'active'`. User must background and foreground the app for auto-retry.
- **Coverage today:** the foreground-from-launcher scenario works (e.g., user leaves site → phone reconnects → user opens app → regain fires). The in-app recovery scenario does not.
- **Fix direction:** Story 8.9 (or a separate small story) wires NetInfo as a secondary trigger. Existing `detectConnectivityRegain` helper is reusable.

### C-02 — Backend does not validate `contextNote` / `technicianNote` length (pre-existing)

- **Severity:** Medium.
- **Risk:** A malicious or accidental 100 KB note would be accepted by the backend, stored verbatim in the `payloadJson` blob, and rendered on the supervisor screen via React Native `<Text>` — which renders multiline correctly but may overflow the layout on extreme lengths.
- **Not a Story 8.8 regression:** the fields didn't exist before. Worth bundling the length cap with the AI-diagnosis field validation in Story 8.9 since both touch the submission validator chain.
- **Fix direction:** Add `contextNote.length <= 500` and `technicianNote.length <= 2000` to a new `validateOptionalPhotoMetadata` step in `reportSubmissionService.ts`. Mirror on mobile-side with a TextInput `maxLength`.

### C-03 — No renderer tests for the new `ReportPhotoCard` state machine

- **Severity:** Low.
- **Risk:** A future refactor of the inline editor could break the `Salvar observacao` / `Cancelar` flow without test coverage catching it.
- **Status:** Acceptable per Story 8.7 / 8.8 guardrail of "no `@testing-library/react-native` for now". Phone smoke covers this transitively.

### C-04 — Vertical layout has no snapshot test

- **Severity:** Low.
- **Risk:** A future refactor of `SummaryLine` / `MetricLine` could revert a call site to horizontal without anyone noticing.
- **Status:** Same as C-03 — defer with the rest of the renderer-test deferral.

---

## 6. Unverified, would need phone testing

None of these block Story 8.9. They are the items where code-level inspection cannot fully confirm, and the user has explicitly chosen to defer phone testing until all implementation is done.

| Item | Why code-level can't confirm |
|---|---|
| Camera permission flow on the new `Foto do instrumento` panel | Native Android permission UI is not in the JS bundle |
| Supervisor actually sees `contextNote` + `technicianNote` after a full sync round-trip | The vitest covers mobile→DTO; supervisor render requires the backend to actually persist and re-emit the payload |
| Inline editor `Editar observacao` ergonomics (keyboard overlap, multi-line wrap) | Renderer behaviour depends on Android keyboard + screen size |
| Vertical layout readability on the user's specific Android device | Layout density depends on screen width and font scale |
| AppState foreground regain on the user's phone | Cannot simulate the OS event from JS tests |
| PT-BR copy fits screen widths on the user's device | Depends on font + screen |

The Story 8.8 manual phone smoke checklist (steps 1–19 in the implementation artifact) covers all of these.

---

## 7. Regression risk list for Story 8.9

Story 8.9 will touch:

- `reportSubmissionService.submitForValidation` (to enqueue AI job)
- A new worker handler (`ai-diagnosis.generate-for-report`)
- A new `ai_diagnoses` table (SQL migration)
- `SupervisorReviewReportDetail` model (add `aiDiagnosis` field)
- `buildVisualReportProjection` and `buildVisualReviewDetailProjection` call sites in `VisualProductShell.tsx` (add the missing third argument)
- The mobile report screen (manual "Solicitar diagnóstico assistido" Pressable)

Highest regression risks:

1. **Submission flow.** Any change to `submitForValidation` must preserve the Story 8.7 per-attachment try/catch invariant — the report must reach the supervisor even when AI provider fails. AI enqueue should happen AFTER the report is accepted, ideally inside a worker job triggered by an audit event.
2. **Worker handler resilience.** The new AI worker must be idempotent (rerunning for the same report does not create duplicate AI diagnosis records) and must not crash the worker on provider failure.
3. **Mobile projection sites.** The two `buildVisualReportProjection` and `buildVisualReviewDetailProjection` call sites already accept the optional `aiDiagnosis` argument; the change is to wire actual state into them. Make sure both report screen and supervisor detail are wired — Pass 1 found one site was missed.
4. **`evidenceStatus.message` translation.** The Pass 2 PT-BR sweep added `translateEvidencePresenceMessage`. If Story 8.9 changes any backend message strings, they need translation at the mobile boundary too.
5. **The two C-01/C-02 concerns above** can be bundled into Story 8.9.

---

## 8. Recommended next BMAD step

**Greenlight Story 8.9 — AI diagnosis end-to-end.**

Suggested Story 8.9 scope (the user has stated he wants all implementation done before the phone build):

1. **D-01 main track.** New worker job `ai-diagnosis.generate-for-report` with the `mockAiDiagnosisProvider` for default + OpenAI provider for opt-in via `TAGWISE_AI_PROVIDER` env. Backend table `ai_diagnoses` keyed by `report_id`. Enqueue from `submitForValidation` after acceptance. Manual `POST /reports/:id/ai-diagnosis/request` endpoint. Mobile manual button. Both projection sites threaded.
2. **Carry-forward C-01.** Add NetInfo as a secondary regain trigger. Keep `detectConnectivityRegain` as the shared helper.
3. **Carry-forward C-02.** Add length caps on `contextNote` / `technicianNote` in the backend validator and `TextInput maxLength` on mobile.

Optional bundle:

4. **Story 8.10 — seed data depth.** New prior-report records + prior approval decisions seeded against the existing tags. Half-day. Pulls forward the deferred data-realism work.

Sequencing recommendation:

- Story 8.9 first (largest, most blocking for the AI promise).
- Story 8.10 second (or in parallel) once 8.9's worker is stable.
- Single APK rebuild after both.

---

## 9. Validation performed

### Commands run

```powershell
cd c:/Users/emili/Desktop/Projets/TagWise4to20/mobile;  npm test -- --run
cd c:/Users/emili/Desktop/Projets/TagWise4to20/backend; npm test -- --run
```

### Test results

- Mobile vitest: **186 / 186 PASS** (32 test files), 2.23s.
- Backend vitest: **92 PASS / 1 skipped** (env-gated TagWise live API smoke).

### Code paths re-inspected during this pass

- `mobile/src/features/execution/model.ts` (lines 1-3, 224-231, 423-429)
- `mobile/src/features/execution/sharedExecutionShellService.ts` (signature 396-478, `updatePhotoTechnicianNote` 521-573, lock gate 1976-1980, parser 2599-2606, mapper 2545, step-kind guard 3050)
- `mobile/src/features/sync/evidenceUploadOrchestrator.ts` (parser 684-691, submission builder 429-431, try/catch 65-92)
- `mobile/src/features/sync/evidenceUploadApiClient.ts` (DTO surface 26, 114-123)
- `backend/src/modules/report-submissions/model.ts` (DTO 74-85)
- `backend/src/modules/review/supervisorReviewService.ts` (493-496 — no field stripping)
- `mobile/src/features/review/model.ts` (DTO mirror 36-42)
- `mobile/src/features/visual-shell/serviceBackedReview.ts` (projection 69-81, render 285-289, translators added)
- `mobile/src/features/visual-shell/serviceBackedReport.ts` (`formatPhotoExecutionStepLabel`, `formatPhotoContextSubtitle`)
- `mobile/src/features/visual-shell/model.ts` (D-07 demo gate around line 246, 263, 312-363)
- `mobile/src/shell/VisualProductShell.tsx` (TagDetailScreen instrument panel 2678+, ReportPhotoCard 4608-4707, supervisor photo card render, MetricLine/SummaryLine variant prop, 5 vertical-variant sites)
- `mobile/src/shell/TagWiseApp.tsx` (AppState effect, handlers, imports)
- `backend/src/modules/work-packages/seedData.ts` (5 enriched history summaries)

### Limitations

- **No phone test in this pass.** Per the user's explicit choice to QA-and-implement until all stories are done before rebuilding the APK. The 19-step phone smoke remains the final gate before claiming any of D-02 through D-07 are end-to-end verified on a real device.
- **No renderer tests.** Story 8.7 / 8.8 deferral preserved. Cannot verify the `ReportPhotoCard` state machine, vertical layout rendering, or instrument photo panel rendering programmatically.
- **No live backend round-trip.** Cannot prove that a backend that has stored a payload with `contextNote` + `technicianNote` re-emits them to the supervisor. The vitest covers the mobile→DTO path; the backend persistence path is type-safe but not exercised against a real Postgres instance in this QA pass.

---

## Cross-references

- [QA defect discovery report Pass 1](qa-defect-discovery-2026-05-14.md) — the original defect list
- [Story 8.8 implementation artifact](../implementation-artifacts/8-8-evidence-three-context-vertical-layout-and-connectivity-regain.md) — what was just shipped
- [Story 8.7 implementation artifact](../implementation-artifacts/8-7-live-phone-field-workflow-repair.md) — guardrails being preserved
- [Live phone 8.6 regression root-cause analysis](live-phone-story-8-6-regression-root-cause-analysis.md) — the architectural context

---

## Closing note

Story 8.8 lands clean at the code level. The one alarming claim from the QA sub-agents ("updatePhotoTechnicianNote doesn't bump updatedAt — high severity data loss") was wrong; the note travels via the report submission DTO, which always reads the latest payload at submit time, and editing is gated to draft-state reports anyway. The two real carry-forward concerns (AppState in-app regain, missing string-length validation) are small enough to bundle into Story 8.9.

Recommend proceeding with Story 8.9 (AI end-to-end) immediately.
